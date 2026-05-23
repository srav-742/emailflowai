/**
 * Connector Factory — Universal Mail Connector Interface
 *
 * Provides a unified contract for fetching and sending emails
 * regardless of provider or connection method.
 *
 * Usage:
 *   const connector = ConnectorFactory.getConnector(account);
 *   const { emails, lastUid } = await connector.fetchLatestEmails(25);
 *   await connector.sendEmail({ to, subject, body });
 *
 * Supported providers:
 *   - "gmail"        → GmailConnector (App Password or OAuth)
 *   - "outlook"      → GraphConnector (IMAP or Microsoft Graph)
 *   - "imap_custom"  → ImapConnector  (any generic IMAP server)
 *   - "google"       → GmailConnector (legacy alias)
 */

const ImapConnector = require('./ImapConnector');
const SmtpConnector = require('./SmtpConnector');
const GmailConnector = require('./GmailConnector');
const GraphConnector = require('./GraphConnector');

// Known provider IMAP/SMTP configurations for auto-detection
const PROVIDER_CONFIGS = {
  'gmail.com': { provider: 'gmail', imap: { host: 'imap.gmail.com', port: 993 }, smtp: { host: 'smtp.gmail.com', port: 587 } },
  'googlemail.com': { provider: 'gmail', imap: { host: 'imap.gmail.com', port: 993 }, smtp: { host: 'smtp.gmail.com', port: 587 } },
  'outlook.com': { provider: 'outlook', imap: { host: 'outlook.office365.com', port: 993 }, smtp: { host: 'smtp.office365.com', port: 587 } },
  'hotmail.com': { provider: 'outlook', imap: { host: 'outlook.office365.com', port: 993 }, smtp: { host: 'smtp.office365.com', port: 587 } },
  'live.com': { provider: 'outlook', imap: { host: 'outlook.office365.com', port: 993 }, smtp: { host: 'smtp.office365.com', port: 587 } },
  'yahoo.com': { provider: 'yahoo', imap: { host: 'imap.mail.yahoo.com', port: 993 }, smtp: { host: 'smtp.mail.yahoo.com', port: 587 } },
  'ymail.com': { provider: 'yahoo', imap: { host: 'imap.mail.yahoo.com', port: 993 }, smtp: { host: 'smtp.mail.yahoo.com', port: 587 } },
  'zoho.com': { provider: 'zoho', imap: { host: 'imap.zoho.com', port: 993 }, smtp: { host: 'smtp.zoho.com', port: 587 } },
  'icloud.com': { provider: 'icloud', imap: { host: 'imap.mail.me.com', port: 993 }, smtp: { host: 'smtp.mail.me.com', port: 587 } },
  'me.com': { provider: 'icloud', imap: { host: 'imap.mail.me.com', port: 993 }, smtp: { host: 'smtp.mail.me.com', port: 587 } },
  'protonmail.com': { provider: 'protonmail', imap: { host: 'imap.protonmail.ch', port: 993 }, smtp: { host: 'smtp.protonmail.ch', port: 587 } },
  'aol.com': { provider: 'aol', imap: { host: 'imap.aol.com', port: 993 }, smtp: { host: 'smtp.aol.com', port: 587 } },
};

class ConnectorFactory {
  /**
   * Get the appropriate connector for a given EmailAccount.
   *
   * @param {Object} account  Prisma EmailAccount record
   * @returns {GmailConnector|GraphConnector|ImapConnector}
   */
  static getConnector(account) {
    const provider = (account.provider || '').toLowerCase();
    const connectionType = account.connectionType || 'oauth';

    // OAuth connections for Gmail and Outlook go through their existing API paths
    if (connectionType === 'oauth') {
      switch (provider) {
        case 'gmail':
        case 'google':
          return new GmailConnector(account);
        case 'outlook':
        case 'microsoft':
          return new GraphConnector(account);
        default:
          // Generic IMAP fallback even for unknown providers with OAuth flag
          return new ImapConnector(account);
      }
    }

    // IMAP / App Password connections
    switch (provider) {
      case 'gmail':
      case 'google':
        return new GmailConnector(account);
      case 'outlook':
      case 'microsoft':
        return new GraphConnector(account);
      default:
        return new ImapConnector(account);
    }
  }

  /**
   * Get an SMTP connector for sending emails from a given account.
   *
   * @param {Object} account  Prisma EmailAccount record
   * @returns {SmtpConnector}
   */
  static getSmtpConnector(account) {
    return new SmtpConnector(account);
  }

  /**
   * Auto-detect provider configuration from an email address.
   *
   * @param {string} email  Email address to detect provider for
   * @returns {Object|null}  Provider config or null if unknown
   */
  static detectProvider(email) {
    if (!email || !email.includes('@')) return null;

    const domain = email.split('@')[1].toLowerCase();
    return PROVIDER_CONFIGS[domain] || null;
  }

  /**
   * Get all known provider configs for the frontend auto-complete.
   */
  static getAllProviderConfigs() {
    return PROVIDER_CONFIGS;
  }
}

module.exports = ConnectorFactory;
