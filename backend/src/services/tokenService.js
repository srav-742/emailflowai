/**
 * tokenService.js
 *
 * Centralises OAuth token lifecycle management for Gmail.
 *
 * Why this exists:
 *   Google OAuth access tokens expire after ~1 hour. Without explicit refresh
 *   logic that persists the new token back to the database, any email sync or
 *   send operation that runs in a session older than 1 hour silently fails with
 *   a 401 from Google's API.
 *
 * Strategy:
 *   - Proactively refresh the token when it is within 5 minutes of expiry
 *     (not just when it has already expired) to avoid mid-operation failures.
 *   - Write the refreshed access_token + expiry_date back to the User row so
 *     every subsequent call within the same session picks up the fresh token.
 */

const { google } = require('googleapis');
const prisma = require('../config/database');

/** Threshold in milliseconds before expiry at which we pre-emptively refresh. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns a valid (non-expiring) access token for the given user.
 *
 * Algorithm:
 *   1. Load the user row (accessToken, refreshToken, tokenExpiry).
 *   2. If tokenExpiry is null, assume the token is still valid (legacy row
 *      that was stored before expiry tracking was added) and return it as-is.
 *   3. If the token expires within EXPIRY_BUFFER_MS, call Google's token
 *      endpoint using the refresh_token.
 *   4. Persist the new access_token and expiry_date back to the DB.
 *   5. Return the fresh access_token.
 *
 * @param {string} userId  - Primary key of the User record.
 * @returns {Promise<string>} A valid Google OAuth access token.
 * @throws  Will throw if the user has no refresh token (not connected) or if
 *          the Google token refresh call fails.
 */
/**
 * Returns a valid (non-expiring) access token for the given account or user.
 */
async function getValidAccessToken(userId, accountId = null) {
  // If accountId is provided, we use the EmailAccount model.
  // Otherwise, we fall back to the legacy User model fields.
  let target;
  if (accountId) {
    target = await prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiry: true,
        userId: true,
      },
    });
  } else {
    target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiry: true,
      },
    });
  }

  if (!target) {
    const err = new Error(accountId ? 'Email account not found.' : 'User not found.');
    err.statusCode = 404;
    throw err;
  }

  if (!target.accessToken && !target.refreshToken) {
    const err = new Error('Gmail not connected. Please reconnect your Gmail account.');
    err.statusCode = 401;
    throw err;
  }

  if (!target.tokenExpiry) {
    return target.accessToken;
  }

  const expiryMs = new Date(target.tokenExpiry).getTime();
  const isExpiringSoon = expiryMs < Date.now() + EXPIRY_BUFFER_MS;

  if (!isExpiringSoon) {
    return target.accessToken;
  }

  if (!target.refreshToken) {
    const err = new Error('Gmail session expired. Please reconnect your Gmail account.');
    err.statusCode = 401;
    throw err;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 5000}/api/auth/gmail/callback`,
  );

  oauth2Client.setCredentials({ refresh_token: target.refreshToken });

  let credentials;
  try {
    const response = await oauth2Client.refreshAccessToken();
    credentials = response.credentials;
  } catch (refreshError) {
    const isInvalidGrant = refreshError.message?.includes('invalid_grant') || 
                          refreshError.response?.data?.error === 'invalid_grant';

    if (isInvalidGrant) {
      console.warn(`[tokenService] Refresh token revoked or invalid. Clearing tokens.`);
      const updateData = {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
      };

      if (accountId) {
        await prisma.emailAccount.update({ where: { id: accountId }, data: updateData });
      } else {
        await prisma.user.update({ where: { id: userId }, data: { ...updateData, gmailConnectedAt: null } });
      }
    }

    console.error('[tokenService] Failed to refresh access token:', refreshError.message);
    const err = new Error('Failed to refresh Gmail access token. Please reconnect your account.');
    err.statusCode = 401;
    err.cause = refreshError;
    throw err;
  }

  const updateData = {
    accessToken: credentials.access_token,
    tokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
  };

  if (accountId) {
    await prisma.emailAccount.update({ where: { id: accountId }, data: updateData });
  } else {
    await prisma.user.update({ where: { id: userId }, data: updateData });
  }

  console.info('[tokenService] Access token refreshed successfully');

  return credentials.access_token;
}

/**
 * Convenience helper: builds an authenticated Gmail client.
 */
async function getAuthenticatedGmailClient(userId, accountId = null) {
  let credentials;
  if (accountId) {
    credentials = await prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { accessToken: true, refreshToken: true, tokenExpiry: true },
    });
  } else {
    credentials = await prisma.user.findUnique({
      where: { id: userId },
      select: { accessToken: true, refreshToken: true, tokenExpiry: true },
    });
  }

  if (!credentials?.accessToken && !credentials?.refreshToken) {
    const err = new Error('Gmail not connected. Please reconnect your Gmail account.');
    err.statusCode = 401;
    throw err;
  }

  const freshAccessToken = await getValidAccessToken(userId, accountId);

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `http://localhost:${process.env.PORT || 5000}/api/auth/gmail/callback`;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );

  oauth2Client.setCredentials({
    access_token: freshAccessToken,
    refresh_token: credentials.refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

module.exports = { getValidAccessToken, getAuthenticatedGmailClient };
