const prisma = require('../config/database');
const { verifyIdToken } = require('../utils/firebase');
const { generateToken } = require('../utils/jwt');
const { getUserInfo } = require('../utils/gmailOAuth');
const { encrypt } = require('../utils/encryption');
const { msalClient } = require('../config/msalConfig');
const { syncOutlookEmails } = require('../services/outlookSyncService');

function serializeUser(user) {
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
    hasGmailAccess: Boolean(user.refreshToken || user.accessToken),
    gmailConnectedAt: user.gmailConnectedAt,
    lastSyncAt: user.lastSyncAt,
  };
}

function isDatabaseUnavailableError(error) {
  const message = String(error?.message || '');
  const code = String(error?.code || '');

  return (
    code === 'P1001' ||
    code === 'P1002' ||
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

  // 1. Update the main user record (for legacy compatibility and primary identity)
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: tokens.access_token ?? existingUser.accessToken,
      refreshToken: tokens.refresh_token ?? existingUser.refreshToken,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : existingUser.tokenExpiry,
      gmailConnectedAt: new Date(),
    },
  });

  // 2. Create or update the EmailAccount record
  await prisma.emailAccount.upsert({
    where: {
      provider_email: {
        provider: 'google',
        email: accountEmail,
      },
    },
    update: {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      displayName: userInfo.name || accountEmail.split('@')[0],
    },
    create: {
      userId,
      provider: 'google',
      email: accountEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      displayName: userInfo.name || accountEmail.split('@')[0],
      isPrimary: accountEmail === updatedUser.email,
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
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      updatedAt: new Date(),
    },
    create: {
      userId,
      email: accountEmail,
      accessToken: encrypt(tokens.access_token),
      refreshToken: encrypt(tokens.refresh_token),
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
      scope: tokens.scope || [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events'
      ].join(' '),
    },
  });

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
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Auth Error:', error);
    if (!res.headersSent) {
      return sendAuthError(res, error, error.message || 'Authentication failed');
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
      user: serializeUser(user),
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

    res.json({ user: serializeUser(user) });
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

module.exports = { firebaseGoogleLogin, saveGmailTokens, persistGmailTokens, getProfile, logout, outlookAuth, outlookCallback };
