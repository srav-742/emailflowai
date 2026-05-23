/**
 * GmailConnector.js — Gmail-Specific Connector
 *
 * Supports two connection modes:
 *   1. App Password (IMAP/SMTP) — No OAuth consent needed, instant deployment
 *   2. OAuth API (Gmail API) — For power users who want deep Gmail features
 *
 * This connector extends the IMAP/SMTP connectors with Gmail-specific
 * auto-detection of IMAP/SMTP hosts and App Password guidance.
 */

const ImapConnector = require('./ImapConnector');
const SmtpConnector = require('./SmtpConnector');

// Gmail's known server configuration
const GMAIL_IMAP = {
  host: 'imap.gmail.com',
  port: 993,
};

const GMAIL_SMTP = {
  host: 'smtp.gmail.com',
  port: 587,
};

class GmailConnector {
  constructor(account) {
    this.account = account;
    this.connectionType = account.connectionType || 'oauth';

    // For app_password / imap connections, pre-fill Gmail servers if not set
    if (this.connectionType !== 'oauth') {
      this.imapConnector = new ImapConnector({
        ...account,
        imapHost: account.imapHost || GMAIL_IMAP.host,
        imapPort: account.imapPort || GMAIL_IMAP.port,
        imapUsername: account.imapUsername || account.email,
      });

      this.smtpConnector = new SmtpConnector({
        ...account,
        smtpHost: account.smtpHost || GMAIL_SMTP.host,
        smtpPort: account.smtpPort || GMAIL_SMTP.port,
        smtpUsername: account.smtpUsername || account.email,
      });
    }
  }

  /**
   * Fetch emails — routes to IMAP for app_password, or existing Gmail API for OAuth.
   */
  async fetchLatestEmails(limit = 25, sinceUid = null) {
    if (this.connectionType === 'oauth') {
      // Delegate to the existing Gmail API sync (inboxSyncService handles this)
      throw new Error('GmailConnector: OAuth mode should use the existing Gmail API sync path.');
    }

    return this.imapConnector.fetchLatestEmails(limit, sinceUid);
  }

  /**
   * Send email — routes to SMTP for app_password connections.
   */
  async sendEmail(params) {
    if (this.connectionType === 'oauth') {
      throw new Error('GmailConnector: OAuth mode should use the existing Gmail API send path.');
    }

    return this.smtpConnector.sendEmail(params);
  }

  /**
   * Test both IMAP and SMTP connections.
   */
  async testConnection() {
    if (this.connectionType === 'oauth') {
      return { success: true, mode: 'oauth', note: 'OAuth credentials managed separately.' };
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
      mode: 'app_password',
    };
  }

  /**
   * List IMAP folders.
   */
  async listFolders() {
    if (this.connectionType === 'oauth') {
      throw new Error('GmailConnector: OAuth mode should use the existing Gmail API labels path.');
    }

    return this.imapConnector.listFolders();
  }

  /**
   * Return the default Gmail server configuration for App Password setup.
   */
  static getDefaultConfig() {
    return {
      imap: GMAIL_IMAP,
      smtp: GMAIL_SMTP,
      instructions: [
        '1. Go to your Google Account → Security → 2-Step Verification',
        '2. Enable 2-Step Verification if not already enabled',
        '3. Go to App Passwords (search "App Passwords" in Google Account)',
        '4. Generate a new App Password for "Mail"',
        '5. Copy the 16-character password and paste it below',
      ],
    };
  }
}

module.exports = GmailConnector;
