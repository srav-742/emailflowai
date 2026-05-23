/**
 * GraphConnector.js — Microsoft Graph / Outlook Connector
 *
 * Supports:
 *   - Microsoft 365 / Outlook via Graph API (OAuth)
 *   - Outlook.com / Hotmail via IMAP fallback
 *
 * For OAuth mode, delegates to the existing outlookSyncService.
 * For IMAP mode, uses IMAP/SMTP connectors with Outlook server defaults.
 */

const ImapConnector = require('./ImapConnector');
const SmtpConnector = require('./SmtpConnector');

// Outlook / Hotmail known server configuration
const OUTLOOK_IMAP = {
  host: 'outlook.office365.com',
  port: 993,
};

const OUTLOOK_SMTP = {
  host: 'smtp.office365.com',
  port: 587,
};

class GraphConnector {
  constructor(account) {
    this.account = account;
    this.connectionType = account.connectionType || 'oauth';

    if (this.connectionType !== 'oauth') {
      this.imapConnector = new ImapConnector({
        ...account,
        imapHost: account.imapHost || OUTLOOK_IMAP.host,
        imapPort: account.imapPort || OUTLOOK_IMAP.port,
        imapUsername: account.imapUsername || account.email,
      });

      this.smtpConnector = new SmtpConnector({
        ...account,
        smtpHost: account.smtpHost || OUTLOOK_SMTP.host,
        smtpPort: account.smtpPort || OUTLOOK_SMTP.port,
        smtpUsername: account.smtpUsername || account.email,
      });
    }
  }

  /**
   * Fetch emails — routes to IMAP or existing Graph API based on connection type.
   */
  async fetchLatestEmails(limit = 25, sinceUid = null) {
    if (this.connectionType === 'oauth') {
      throw new Error('GraphConnector: OAuth mode should use the existing Microsoft Graph sync path.');
    }

    return this.imapConnector.fetchLatestEmails(limit, sinceUid);
  }

  /**
   * Send email — routes to SMTP for IMAP connections.
   */
  async sendEmail(params) {
    if (this.connectionType === 'oauth') {
      throw new Error('GraphConnector: OAuth mode should use the existing Microsoft Graph send path.');
    }

    return this.smtpConnector.sendEmail(params);
  }

  /**
   * Test connection credentials.
   */
  async testConnection() {
    if (this.connectionType === 'oauth') {
      return { success: true, mode: 'oauth', note: 'Microsoft Graph OAuth credentials managed separately.' };
    }

    const [imapResult, smtpResult] = await Promise.allSettled([
      this.imapConnector.testConnection(),
      this.smtpConnector.testConnection(),
    ]);

    const imap = imapResult.status === 'fulfilled' ? imapResult.value : { success: false, error: imapResult.reason?.message };
    const smtp = smtpResult.status === 'fulfilled' ? smtpResult.value : { success: false, error: smtpResult.reason?.message };

    return {
      success: imap.success && smtp.success,
      imap,
      smtp,
      mode: 'imap',
    };
  }

  /**
   * Return the default Outlook server configuration.
   */
  static getDefaultConfig() {
    return {
      imap: OUTLOOK_IMAP,
      smtp: OUTLOOK_SMTP,
      instructions: [
        '1. Go to your Microsoft Account → Security settings',
        '2. Enable Two-Factor Authentication if not already enabled',
        '3. Generate an App Password for "EmailFlow AI"',
        '4. Copy and paste the generated password below',
      ],
    };
  }
}

module.exports = GraphConnector;
