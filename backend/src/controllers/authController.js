const prisma = require('../config/database');
const { verifyIdToken } = require('../utils/firebase');
const { generateToken } = require('../utils/jwt');
const { getUserInfo } = require('../utils/gmailOAuth');
const { encrypt } = require('../utils/encryption');
const { msalClient } = require('../config/msalConfig');
const { syncOutlookEmails } = require('../services/outlookSyncService');
const { hasGoogleConnection } = require('../services/googleConnectionService');

// Clerk (optional — only available when CLERK_SECRET_KEY is set)
let verifyClerkToken = null;
try {
  const clerkConfig = require('../config/clerk');
  verifyClerkToken = clerkConfig.verifyClerkToken;
} catch (_) {
  // Clerk not available
}

async function serializeUser(user, options = {}) {
  const hasGmailAccess = options.hasGmailAccess ?? await hasGoogleConnection(user.id, user);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan || 'free',
    profileImage: user.profileImage,
    oauthProvider: user.oauthProvider,
    style: user.style || null,
    importantContacts: Array.isArray(user.importantContacts) ? user.importantContacts : [],
    createdAt: user.createdAt,
    hasGmailAccess,
    gmailConnectedAt: user.gmailConnectedAt,
    lastSyncAt: user.lastSyncAt,
  };
}

function isDatabaseUnavailableError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');

  return (
    code === 'P1010' ||
    code === 'P1001' ||
    code === 'P1002' ||
    message.includes('denied access on the database') ||
    message.includes('was denied access') ||
    message.includes('permission denied') ||
    message.includes("Can't reach database server") ||
    message.includes('database server') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT')
  );
}

function sendAuthError(res, error, fallbackMessage) {
  if (isDatabaseUnavailableError(error)) {
    return res.status(503).json({
      error: 'Authentication temporarily unavailable',
      details: 'Database connection failed while completing sign-in.',
    });
  }

  return res.status(500).json({
    error: fallbackMessage,
  });
}

async function persistGmailTokens(userId, tokens) {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new Error('User not found while saving Gmail tokens.');
  }

  // Get email for this token set
  const userInfo = await getUserInfo(tokens);
  const accountEmail = userInfo.email;
  const isPrimaryIdentity = existingUser.email === accountEmail;

  const [existingEmailAccount, existingOAuthToken] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: {
        provider_email: {
          provider: 'google',
          email: accountEmail,
        },
      },
      select: {
        accessToken: true,
        refreshToken: true,
        tokenExpiry: true,
      },
    }),
    prisma.oAuthToken.findUnique({
      where: {
        userId_email: {
          userId,
          email: accountEmail,
        },
      },
      select: {
        accessToken: true,
        refreshToken: true,
        tokenExpiry: true,
      },
    }),
  ]);

  const nextAccessToken =
    tokens.access_token ??
    existingEmailAccount?.accessToken ??
    (isPrimaryIdentity ? existingUser.accessToken : null);
  const nextRefreshToken =
    tokens.refresh_token ??
    existingEmailAccount?.refreshToken ??
    (isPrimaryIdentity ? existingUser.refreshToken : null);
  const nextEncryptedAccessToken =
    (nextAccessToken ? encrypt(nextAccessToken) : null) ??
    existingOAuthToken?.accessToken ??
    null;
  const nextEncryptedRefreshToken =
    (tokens.refresh_token ? encrypt(tokens.refresh_token) : null) ??
    existingOAuthToken?.refreshToken ??
    (isPrimaryIdentity && existingUser.refreshToken ? encrypt(existingUser.refreshToken) : null);
  const nextTokenExpiry =
    (tokens.expiry_date ? new Date(tokens.expiry_date) : null) ??
    existingEmailAccount?.tokenExpiry ??
    existingOAuthToken?.tokenExpiry ??
    existingUser.tokenExpiry ??
    new Date(Date.now() + 3600 * 1000);

  if (!nextAccessToken || !nextEncryptedAccessToken) {
    throw new Error('Google did not return an access token. Please reconnect Gmail.');
  }

  if (!nextRefreshToken || !nextEncryptedRefreshToken) {
    throw new Error('Google did not return a refresh token. Reconnect Gmail and approve offline access.');
  }

  // 1. Update the main user record (for legacy compatibility and primary identity)
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(isPrimaryIdentity
        ? {
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            tokenExpiry: nextTokenExpiry,
          }
        : {}),
      gmailConnectedAt: new Date(),
    },
  });

  // 2. Create or update the EmailAccount record
  const emailAccount = await prisma.emailAccount.upsert({
    where: {
      provider_email: {
        provider: 'google',
        email: accountEmail,
      },
    },
    update: {
      userId,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      tokenExpiry: nextTokenExpiry,
      displayName: userInfo.name || accountEmail.split('@')[0],
      syncEnabled: true,
    },
    create: {
      userId,
      provider: 'google',
      email: accountEmail,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      tokenExpiry: nextTokenExpiry,
      displayName: userInfo.name || accountEmail.split('@')[0],
      isPrimary: accountEmail === updatedUser.email,
      syncEnabled: true,
    },
  });

  // 3. Create or update the encrypted OAuthToken record
  await prisma.oAuthToken.upsert({
    where: {
      userId_email: {
        userId,
        email: accountEmail,
      },
    },
    update: {
      accessToken: nextEncryptedAccessToken,
      refreshToken: nextEncryptedRefreshToken,
      tokenExpiry: nextTokenExpiry,
      updatedAt: new Date(),
    },
    create: {
      userId,
      email: accountEmail,
      accessToken: nextEncryptedAccessToken,
      refreshToken: nextEncryptedRefreshToken,
      tokenExpiry: nextTokenExpiry,
      scope: tokens.scope || [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events'
      ].join(' '),
    },
  });

  // 4. Trigger immediate background sync for the newly connected account
  try {
    const { gmailQueue } = require('../queues/gmail.queue');
    await gmailQueue.add('sync-inbox', {
      type: 'sync-inbox',
      userId,
      accountId: emailAccount.id,
    });
    console.log(`[Auth] Queued immediate sync for ${accountEmail} (account: ${emailAccount.id})`);
  } catch (queueError) {
    console.error('[Auth] Failed to queue initial sync:', queueError.message);
  }

  return updatedUser;
}

const firebaseGoogleLogin = async (req, res) => {
  try {
    const { idToken, token } = req.body;
    const firebaseToken = idToken || token;

    if (!firebaseToken) {
      return res.status(400).json({ error: 'Firebase ID token is required' });
    }

    let decodedToken;

    try {
      decodedToken = await verifyIdToken(firebaseToken);
      console.log("Decoded Token:", decodedToken);
    } catch (tokenError) {
      console.error('Firebase token verification failed:', tokenError);
      return res.status(401).json({
        error: `Invalid Firebase token: ${tokenError.message}`,
      });
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const name = decodedToken.name;
    const picture = decodedToken.picture;

    if (!email) {
      console.error("Decoded token missing email:", decodedToken);
      return res.status(400).json({ error: 'Email not found in token' });
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          oauthProvider: 'firebase_google',
          firebaseUid: uid,
          profileImage: picture || null,
          lastLogin: new Date(),
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid: uid,
          profileImage: picture || user.profileImage,
          lastLogin: new Date(),
        },
      });
    }

    const jwtToken = generateToken({ id: user.id, email: user.email });

    res.json({
      token: jwtToken,
      user: await serializeUser(user),
    });
  } catch (error) {
    console.error('Auth Error:', error);
    if (!res.headersSent) {
      return sendAuthError(res, error, 'Authentication failed');
    }
  }
};

const saveGmailTokens = async (req, res) => {
  try {
    const { tokens } = req.body;

    if (!tokens?.access_token && !tokens?.refresh_token) {
      return res.status(400).json({ error: 'Gmail tokens are required' });
    }

    const user = await persistGmailTokens(req.user.id, tokens);

    res.json({
      message: 'Gmail connected successfully',
      user: await serializeUser(user, { hasGmailAccess: true }),
    });
  } catch (error) {
    console.error('Save Gmail tokens error:', error);
    return sendAuthError(res, error, 'Failed to save Gmail connection');
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        oauthProvider: true,
        profileImage: true,
        plan: true,
        style: true,
        importantContacts: true,
        createdAt: true,
        accessToken: true,
        refreshToken: true,
        gmailConnectedAt: true,
        lastSyncAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: await serializeUser(user) });
  } catch (error) {
    console.error('Get profile error:', error);
    return sendAuthError(res, error, 'Failed to fetch profile');
  }
};

const logout = async (req, res) => {
  try {
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

/**
 * POST /api/auth/clerk-login
 * Authenticate via Clerk session token.
 * Creates or updates the user in our database and returns an internal JWT.
 */
const clerkLogin = async (req, res) => {
  try {
    if (!verifyClerkToken) {
      return res.status(503).json({ error: 'Clerk authentication is not configured.' });
    }

    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ error: 'Clerk session token is required.' });
    }

    let claims;
    try {
      claims = await verifyClerkToken(sessionToken);
    } catch (tokenError) {
      console.error('[Clerk] Token verification failed:', tokenError.message);
      return res.status(401).json({ error: 'Invalid Clerk session token.' });
    }

    const clerkUserId = claims.sub;
    const email = claims.email || claims.primary_email;
    const name = claims.name || claims.first_name || null;
    const picture = claims.image_url || claims.profile_image_url || null;

    if (!email) {
      return res.status(400).json({ error: 'Email not found in Clerk session.' });
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          oauthProvider: 'clerk',
          clerkUserId,
          profileImage: picture || null,
          lastLogin: new Date(),
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          clerkUserId,
          profileImage: picture || user.profileImage,
          lastLogin: new Date(),
        },
      });
    }

    const jwtToken = generateToken({ id: user.id, email: user.email });

    res.json({
      token: jwtToken,
      user: await serializeUser(user),
    });
  } catch (error) {
    console.error('[Clerk] Auth Error:', error);
    if (!res.headersSent) {
      return sendAuthError(res, error, 'Clerk authentication failed');
    }
  }
};

/**
 * POST /api/auth/register
 * Register a new user with email + password (internal auth).
 * This allows login without any OAuth provider.
 */
const registerWithEmail = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash the password
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        oauthProvider: 'email',
        // Store hashed password in accessToken field (repurposed for internal auth)
        // In production, add a dedicated passwordHash column
        lastLogin: new Date(),
      },
    });

    const jwtToken = generateToken({ id: user.id, email: user.email });

    res.status(201).json({
      token: jwtToken,
      user: await serializeUser(user),
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    if (!res.headersSent) {
      return sendAuthError(res, error, 'Registration failed');
    }
  }
};

const outlookAuth = async (req, res) => {
  try {
    const authCodeUrlParameters = {
      scopes: ['user.read', 'mail.read', 'mail.send', 'offline_access'],
      redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:5050/auth/outlook/callback',
    };

    const response = await msalClient.getAuthCodeUrl(authCodeUrlParameters);
    res.redirect(response);
  } catch (error) {
    console.error('Outlook auth error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=outlook_auth_failed`);
  }
};

const outlookCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const userId = req.query.state; // We should pass userId in state if possible, or use session

    const tokenRequest = {
      code,
      scopes: ['user.read', 'mail.read', 'mail.send', 'offline_access'],
      redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:5050/auth/outlook/callback',
    };

    const response = await msalClient.acquireTokenByCode(tokenRequest);
    const { accessToken, refreshToken, account } = response;
    const email = account.username;

    // Persist to DB
    const emailAccount = await prisma.emailAccount.upsert({
      where: { userId_email: { userId: account.homeAccountId, email } }, // Using homeAccountId as userId for simplicity in this demo, usually it's from JWT
      update: {
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : undefined,
        provider: 'outlook',
      },
      create: {
        userId: account.homeAccountId,
        email,
        displayName: account.name,
        provider: 'outlook',
        accessToken: encrypt(accessToken),
        refreshToken: refreshToken ? encrypt(refreshToken) : '',
      }
    });

    // Sync initial emails
    await syncOutlookEmails(accessToken, emailAccount.userId, emailAccount.id);

    res.redirect(`${process.env.FRONTEND_URL}/settings?status=success&provider=outlook`);
  } catch (error) {
    console.error('Outlook callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?error=outlook_sync_failed`);
  }
};

module.exports = {
  firebaseGoogleLogin,
  saveGmailTokens,
  persistGmailTokens,
  getProfile,
  logout,
  outlookAuth,
  outlookCallback,
  clerkLogin,
  registerWithEmail,
};
