const { google } = require('googleapis');
const prisma = require('../../config/database');
const { encryptToken, decryptToken } = require('../../utils/cryptoUtils');
const { getGmailOAuthConfig, getConfiguredRedirectUri } = require('../../utils/gmailOAuth');

class TokenManagerService {
  constructor() {
    this.config = getGmailOAuthConfig();
  }

  createOAuth2Client() {
    return new google.auth.OAuth2(
      this.config.clientId,
      process.env.GOOGLE_CLIENT_SECRET,
      getConfiguredRedirectUri()
    );
  }

  /**
   * Retrieves an initialized OAuth2 client for a given user and email,
   * with automatic token refresh handling that persists encrypted tokens to the DB.
   */
  async getSecureOAuth2Client(userId, email) {
    const oauthToken = await prisma.oAuthToken.findUnique({
      where: { userId_email: { userId, email } },
    });

    if (!oauthToken) {
      throw new Error(`OAuthToken not found for user ${userId} and email ${email}`);
    }

    const oauth2Client = this.createOAuth2Client();

    // Determine access/refresh tokens, preferring encrypted fields if present
    const accessToken = oauthToken.encryptedAccessToken 
      ? decryptToken(oauthToken.encryptedAccessToken) 
      : oauthToken.accessToken;
      
    const refreshToken = oauthToken.encryptedRefreshToken
      ? decryptToken(oauthToken.encryptedRefreshToken)
      : oauthToken.refreshToken;

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: oauthToken.tokenExpiry ? oauthToken.tokenExpiry.getTime() : null,
    });

    // Attach event listener for automatic token refresh persistence
    oauth2Client.on('tokens', async (tokens) => {
      try {
        const updateData = {
          updatedAt: new Date(),
        };

        if (tokens.access_token) {
          updateData.encryptedAccessToken = encryptToken(tokens.access_token);
          // Only update expiry if provided
          if (tokens.expiry_date) {
            updateData.tokenExpiry = new Date(tokens.expiry_date);
          }
        }
        
        if (tokens.refresh_token) {
          updateData.encryptedRefreshToken = encryptToken(tokens.refresh_token);
        }

        await prisma.oAuthToken.update({
          where: { userId_email: { userId, email } },
          data: updateData,
        });
        
        console.log(`[TokenManager] Securely updated refreshed tokens for ${email}`);
      } catch (error) {
        console.error(`[TokenManager] Failed to persist refreshed tokens for ${email}`, error);
      }
    });

    return oauth2Client;
  }
  
  /**
   * Helper to quickly check if a token is near expiry (within 5 minutes)
   */
  isTokenNearExpiry(tokenExpiryDate) {
    if (!tokenExpiryDate) return true;
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    return (tokenExpiryDate.getTime() - Date.now()) < FIVE_MINUTES_MS;
  }
}

module.exports = new TokenManagerService();
