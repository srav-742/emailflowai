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
const { getAuthClient, getGmailClient } = require('../lib/google/getAuthClient');
const { decrypt } = require('../utils/encryption');

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
  // Find the email associated with this userId/accountId
  let email;
  if (accountId) {
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId }, select: { email: true } });
    email = account?.email;
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    email = user?.email;
  }

  if (!email) throw new Error('No email found for token retrieval.');

  // getAuthClient handles the auto-refresh and database update
  const auth = await getAuthClient(userId, email);
  const credentials = await auth.getAccessToken();
  return credentials.token;
}

/**
 * Convenience helper: builds an authenticated Gmail client.
 */
async function getAuthenticatedGmailClient(userId, accountId = null) {
  let email;
  if (accountId) {
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId }, select: { email: true } });
    email = account?.email;
  } else {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    email = user?.email;
  }

  if (!email) throw new Error('No email found for Gmail client creation.');

  return await getGmailClient(userId, email);
}

module.exports = { getValidAccessToken, getAuthenticatedGmailClient };
