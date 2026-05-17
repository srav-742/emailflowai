const { google } = require('googleapis');
const prisma = require('../../config/database');
const { decrypt, encrypt } = require('../../utils/encryption');
const {
  createReconnectError,
  disableGoogleConnection,
  isGoogleRefreshTokenInvalid,
} = require('../../services/googleConnectionService');

/**
 * Returns an authenticated Google OAuth2 client for a specific user and email.
 * Automatically refreshes the token if it's within 5 minutes of expiry.
 * 
 * @param {string} userId - The unique ID of the user.
 * @param {string} email - The email address associated with the account.
 * @returns {Promise<google.auth.OAuth2>}
 */
async function getAuthClient(userId, email) {
  const tokenRecord = await prisma.oAuthToken.findUnique({
    where: {
      userId_email: { userId, email }
    }
  });

  if (!tokenRecord) {
    // Fallback: Check if we have tokens in the legacy EmailAccount table
    const legacyAccount = await prisma.emailAccount.findFirst({
      where: {
        userId,
        email,
        provider: 'google',
      }
    });

    if (!legacyAccount || !legacyAccount.refreshToken) {
      // Final Fallback: Check the primary User table
      console.log(`[OAuth] No tokens in EmailAccount for ${email}, checking primary User table...`);
      const primaryUser = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!primaryUser || !primaryUser.refreshToken || primaryUser.email !== email) {
        console.error(`[OAuth] No tokens found for ${email} in any table.`);
        throw new Error(`No OAuth tokens found for user ${userId} and email ${email}`);
      }
      
      return await migrateAndGetClient(userId, email, primaryUser);
    }

    // Migrate legacy tokens to the new table
    return await migrateAndGetClient(userId, email, legacyAccount);
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 5050}/api/auth/gmail/callback`
  );

  const accessToken = decrypt(tokenRecord.accessToken);
  const refreshToken = decrypt(tokenRecord.refreshToken);

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: tokenRecord.tokenExpiry.getTime()
  });

  // 5 minute buffer for auto-refresh
  const isExpiringSoon = tokenRecord.tokenExpiry.getTime() < Date.now() + (5 * 60 * 1000);

  if (isExpiringSoon) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      const nextAccessToken = credentials.access_token || accessToken;
      const nextRefreshToken = credentials.refresh_token || refreshToken;
      const nextTokenExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : tokenRecord.tokenExpiry;

      await prisma.$transaction(async (tx) => {
        await tx.oAuthToken.update({
          where: { id: tokenRecord.id },
          data: {
            accessToken: encrypt(nextAccessToken),
            refreshToken: encrypt(nextRefreshToken),
            tokenExpiry: nextTokenExpiry,
            updatedAt: new Date()
          }
        });

        await tx.emailAccount.updateMany({
          where: {
            userId,
            email,
            provider: 'google',
          },
          data: {
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            tokenExpiry: nextTokenExpiry,
            syncEnabled: true,
          },
        });

        await tx.user.updateMany({
          where: {
            id: userId,
            email,
          },
          data: {
            accessToken: nextAccessToken,
            refreshToken: nextRefreshToken,
            tokenExpiry: nextTokenExpiry,
            gmailConnectedAt: new Date(),
          },
        });
      });

      console.log(`[OAuth] Refreshed access token for ${email}`);
    } catch (error) {
      console.error(`[OAuth] Failed to refresh token for ${email}:`, error.message);

      if (isGoogleRefreshTokenInvalid(error)) {
        try {
          await disableGoogleConnection(userId, email);
        } catch (disconnectError) {
          console.error(`[OAuth] Failed to disable revoked Google connection for ${email}:`, disconnectError.message);
        }

        console.warn(`[OAuth] Refresh token is invalid/revoked for ${email}. Re-auth required.`);
        throw createReconnectError();
      }

      throw error;
    }
  }

  return oauth2Client;
}

/**
 * Helper to migrate legacy tokens and return an auth client.
 */
async function migrateAndGetClient(userId, email, legacyAccount) {
  console.log(`[OAuth] Migrating tokens for ${email} to encrypted storage...`);

  await prisma.oAuthToken.create({
    data: {
      userId,
      email,
      accessToken: encrypt(legacyAccount.accessToken),
      refreshToken: encrypt(legacyAccount.refreshToken),
      tokenExpiry: legacyAccount.tokenExpiry || new Date(Date.now() + 3600 * 1000), // Default 1h if missing
      scope: legacyAccount.scope || [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events'
      ].join(' ')
    }
  });

  return getAuthClient(userId, email);
}

/**
 * Returns an authenticated Google Gmail client.
 */
async function getGmailClient(userId, email) {
  const auth = await getAuthClient(userId, email);
  return google.gmail({ version: 'v1', auth });
}

/**
 * Returns an authenticated Google Calendar client.
 */
async function getCalendarClient(userId, email) {
  const auth = await getAuthClient(userId, email);
  return google.calendar({ version: 'v3', auth });
}

module.exports = { getAuthClient, getGmailClient, getCalendarClient };
