/**
 * mailConnectionController.js — Universal Mail Connection Controller
 *
 * Handles:
 *   - Connecting new email accounts (IMAP/SMTP/App Password)
 *   - Testing connection credentials
 *   - Auto-detecting provider from email domain
 *   - Disconnecting accounts
 *   - Listing supported providers
 */

const prisma = require('../config/database');
const { encrypt } = require('../utils/encryption');
const ConnectorFactory = require('../services/connector');
const { mailSyncQueue } = require('../queues/mail-sync.queue');
const { syncImapAccount } = require('../services/imapSyncService');

/**
 * POST /api/mail/connect
 * Connect a new email account via IMAP/SMTP or App Password.
 */
const connectMailAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      email,
      password,          // Plain text — will be encrypted before storage
      provider,          // "gmail", "outlook", "yahoo", "imap_custom"
      connectionType,    // "app_password" or "imap"
      displayName,
      // Optional manual IMAP/SMTP overrides
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Auto-detect provider if not specified
    const detected = ConnectorFactory.detectProvider(email);
    const resolvedProvider = provider || detected?.provider || 'imap_custom';

    // Resolve IMAP/SMTP server settings
    const resolvedImapHost = imapHost || detected?.imap?.host || null;
    const resolvedImapPort = imapPort || detected?.imap?.port || 993;
    const resolvedSmtpHost = smtpHost || detected?.smtp?.host || null;
    const resolvedSmtpPort = smtpPort || detected?.smtp?.port || 587;

    if (!resolvedImapHost || !resolvedSmtpHost) {
      return res.status(400).json({
        error: 'Could not auto-detect mail server. Please provide IMAP and SMTP host manually.',
        requiresManualConfig: true,
      });
    }

    // Encrypt the password for storage
    const encryptedPassword = encrypt(password);

    // Test the connection before saving
    const testAccount = {
      email,
      imapHost: resolvedImapHost,
      imapPort: resolvedImapPort,
      imapUsername: email,
      imapPassword: encryptedPassword,
      smtpHost: resolvedSmtpHost,
      smtpPort: resolvedSmtpPort,
      smtpUsername: email,
      smtpPassword: encryptedPassword,
      displayName: displayName || email.split('@')[0],
      provider: resolvedProvider,
      connectionType: connectionType || 'app_password',
    };

    const connector = ConnectorFactory.getConnector(testAccount);
    const testResult = await connector.testConnection();

    if (!testResult.success) {
      return res.status(400).json({
        error: 'Connection test failed. Please check your credentials.',
        details: testResult,
      });
    }

    // Check if this account already exists
    const existingAccount = await prisma.emailAccount.findUnique({
      where: {
        provider_email: {
          provider: resolvedProvider,
          email,
        },
      },
    });

    let emailAccount;

    if (existingAccount) {
      // Update the existing account with new credentials
      emailAccount = await prisma.emailAccount.update({
        where: { id: existingAccount.id },
        data: {
          userId,
          connectionType: connectionType || 'app_password',
          imapHost: resolvedImapHost,
          imapPort: resolvedImapPort,
          imapUsername: email,
          imapPassword: encryptedPassword,
          smtpHost: resolvedSmtpHost,
          smtpPort: resolvedSmtpPort,
          smtpUsername: email,
          smtpPassword: encryptedPassword,
          displayName: displayName || existingAccount.displayName || email.split('@')[0],
          syncEnabled: true,
          requiresReconnect: false,
        },
      });
    } else {
      // Create a new account
      const accountCount = await prisma.emailAccount.count({ where: { userId } });

      emailAccount = await prisma.emailAccount.create({
        data: {
          userId,
          provider: resolvedProvider,
          email,
          connectionType: connectionType || 'app_password',
          displayName: displayName || email.split('@')[0],
          isPrimary: accountCount === 0,
          imapHost: resolvedImapHost,
          imapPort: resolvedImapPort,
          imapUsername: email,
          imapPassword: encryptedPassword,
          smtpHost: resolvedSmtpHost,
          smtpPort: resolvedSmtpPort,
          smtpUsername: email,
          smtpPassword: encryptedPassword,
          syncEnabled: true,
        },
      });
    }

    let initialSync = null;

    // Run one immediate sync so the account has visible inbox data right away.
    try {
      initialSync = await syncImapAccount(userId, emailAccount.id, { limit: 50 });
      console.log(`[MailConnect] Initial IMAP sync completed for ${email} (account: ${emailAccount.id})`);
    } catch (syncError) {
      console.error('[MailConnect] Initial sync failed:', syncError.message);
    }

    // Queue a follow-up IMAP sync for background retry/continuation.
    try {
      await mailSyncQueue.add('sync-imap', {
        type: 'sync-imap',
        userId,
        accountId: emailAccount.id,
      });
      console.log(`[MailConnect] Queued initial IMAP sync for ${email} (account: ${emailAccount.id})`);
    } catch (queueError) {
      console.error('[MailConnect] Failed to queue initial sync:', queueError.message);
    }

    // Return sanitized account (no secrets)
    res.json({
      message: 'Email account connected successfully',
      account: sanitizeAccount(emailAccount),
      initialSync,
    });
  } catch (error) {
    console.error('[MailConnect] Error connecting account:', error);
    res.status(500).json({ error: 'Failed to connect email account.' });
  }
};

/**
 * POST /api/mail/test-connection
 * Test IMAP/SMTP credentials without saving.
 */
const testConnection = async (req, res) => {
  try {
    const { email, password, imapHost, imapPort, smtpHost, smtpPort } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const detected = ConnectorFactory.detectProvider(email);
    const encryptedPassword = encrypt(password);

    const testAccount = {
      email,
      imapHost: imapHost || detected?.imap?.host,
      imapPort: imapPort || detected?.imap?.port || 993,
      imapUsername: email,
      imapPassword: encryptedPassword,
      smtpHost: smtpHost || detected?.smtp?.host,
      smtpPort: smtpPort || detected?.smtp?.port || 587,
      smtpUsername: email,
      smtpPassword: encryptedPassword,
      provider: detected?.provider || 'imap_custom',
      connectionType: 'app_password',
    };

    if (!testAccount.imapHost || !testAccount.smtpHost) {
      return res.status(400).json({
        error: 'Could not auto-detect mail server. Please provide IMAP and SMTP host.',
        requiresManualConfig: true,
      });
    }

    const connector = ConnectorFactory.getConnector(testAccount);
    const result = await connector.testConnection();

    res.json(result);
  } catch (error) {
    console.error('[MailConnect] Test connection error:', error);
    res.status(500).json({ error: 'Connection test failed.' });
  }
};

/**
 * GET /api/mail/detect-provider
 * Auto-detect IMAP/SMTP settings from an email address.
 */
const detectProvider = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const detected = ConnectorFactory.detectProvider(email);

    if (!detected) {
      return res.json({
        detected: false,
        message: 'Provider not recognized. Please enter IMAP/SMTP settings manually.',
      });
    }

    res.json({
      detected: true,
      provider: detected.provider,
      imap: detected.imap,
      smtp: detected.smtp,
    });
  } catch (error) {
    console.error('[MailConnect] Detect provider error:', error);
    res.status(500).json({ error: 'Provider detection failed.' });
  }
};

/**
 * GET /api/mail/providers
 * List all supported providers with their default configurations.
 */
const listProviders = async (req, res) => {
  const providers = [
    {
      id: 'gmail',
      name: 'Gmail',
      icon: '📧',
      connectionTypes: ['app_password', 'oauth'],
      defaultConfig: { imap: { host: 'imap.gmail.com', port: 993 }, smtp: { host: 'smtp.gmail.com', port: 587 } },
      instructions: [
        'Enable 2-Step Verification in your Google Account',
        'Go to Google Account → Security → App Passwords',
        'Generate a new App Password for "Mail"',
        'Use the 16-character password to connect',
      ],
    },
    {
      id: 'outlook',
      name: 'Outlook / Microsoft 365',
      icon: '📮',
      connectionTypes: ['app_password', 'oauth'],
      defaultConfig: { imap: { host: 'outlook.office365.com', port: 993 }, smtp: { host: 'smtp.office365.com', port: 587 } },
      instructions: [
        'Enable Two-Factor Authentication in your Microsoft Account',
        'Generate an App Password under Security settings',
        'Use the generated password to connect',
      ],
    },
    {
      id: 'yahoo',
      name: 'Yahoo Mail',
      icon: '💜',
      connectionTypes: ['app_password'],
      defaultConfig: { imap: { host: 'imap.mail.yahoo.com', port: 993 }, smtp: { host: 'smtp.mail.yahoo.com', port: 587 } },
      instructions: [
        'Go to Yahoo Account → Account Security',
        'Generate an App Password',
        'Use the generated password to connect',
      ],
    },
    {
      id: 'imap_custom',
      name: 'Other / Custom IMAP',
      icon: '⚙️',
      connectionTypes: ['imap'],
      defaultConfig: null,
      instructions: [
        'Get your IMAP and SMTP server details from your email provider',
        'Enter the host, port, username, and password below',
      ],
    },
  ];

  res.json({ providers });
};

/**
 * Strip sensitive fields from account records before sending to frontend.
 */
function sanitizeAccount(account) {
  return {
    id: account.id,
    email: account.email,
    provider: account.provider,
    connectionType: account.connectionType,
    displayName: account.displayName,
    isPrimary: account.isPrimary,
    color: account.color,
    syncEnabled: account.syncEnabled,
    lastSyncAt: account.lastSyncAt,
    requiresReconnect: account.requiresReconnect,
    createdAt: account.createdAt,
    // IMAP/SMTP hosts (non-sensitive, useful for UI display)
    imapHost: account.imapHost,
    smtpHost: account.smtpHost,
    // Never expose: imapPassword, smtpPassword, accessToken, refreshToken
  };
}

module.exports = {
  connectMailAccount,
  testConnection,
  detectProvider,
  listProviders,
};
