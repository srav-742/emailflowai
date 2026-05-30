const prisma = require('../../config/database');
const tokenManager = require('./tokenManagerService');
const { google } = require('googleapis');

class AccountHealthService {
  /**
   * Verifies the health of a specific account by making a lightweight API call.
   * If it fails with invalid_grant, marks the account as requires_reauth.
   */
  async checkAccountHealth(userId, email) {
    try {
      const oauth2Client = await tokenManager.getSecureOAuth2Client(userId, email);
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Lightweight call to verify token validity
      await gmail.users.getProfile({ userId: 'me' });

      // If successful, mark as healthy
      await prisma.oAuthToken.update({
        where: { userId_email: { userId, email } },
        data: {
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
        },
      });

      return { status: 'healthy' };
    } catch (error) {
      console.error(`[AccountHealth] Check failed for ${email}:`, error.message);
      
      let newHealthStatus = 'failing';
      
      // Specifically check for invalid_grant which requires user re-authentication
      if (error.message.includes('invalid_grant') || error.message.includes('invalid_token')) {
        newHealthStatus = 'requires_reauth';
      }

      await prisma.oAuthToken.update({
        where: { userId_email: { userId, email } },
        data: {
          healthStatus: newHealthStatus,
          lastHealthCheck: new Date(),
        },
      });

      return { status: newHealthStatus, error: error.message };
    }
  }

  /**
   * Scans all connected accounts and updates their health status.
   * Useful for a background cron job.
   */
  async scanAllAccounts() {
    const tokens = await prisma.oAuthToken.findMany({
      select: { userId: true, email: true }
    });

    const results = [];
    for (const token of tokens) {
      const result = await this.checkAccountHealth(token.userId, token.email);
      results.push({ email: token.email, ...result });
    }

    return results;
  }
}

module.exports = new AccountHealthService();
