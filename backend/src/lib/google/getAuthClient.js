const { google } = require('googleapis');
const prisma = require('../../config/database');
const { decrypt, encrypt } = require('../../utils/encryption');

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
      where: { userId, email }
    });

    if (!legacyAccount || !legacyAccount.refreshToken) {
      throw new Error(`No OAuth tokens found for user ${userId} and email ${email}`);
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
      
      await prisma.oAuthToken.update({
        where: { id: tokenRecord.id },
        data: {
          accessToken: encrypt(credentials.access_token),
          tokenExpiry: new Date(credentials.expiry_date),
          updatedAt: new Date()
        }
      });

      console.log(`[OAuth] Refreshed access token for ${email}`);
    } catch (error) {
      console.error(`[OAuth] Failed to refresh token for ${email}:`, error.message);
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
  
  const tokenRecord = await prisma.oAuthToken.create({
    data: {
      userId,
      email,
      accessToken: encrypt(legacyAccount.accessToken),
      refreshToken: encrypt(legacyAccount.refreshToken),
      tokenExpiry: legacyAccount.tokenExpiry || new Date(Date.now() + 3600 * 1000), // Default 1h if missing
      scope: 'https://www.googleapis.com/auth/gmail.readonly' // Default scope
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
