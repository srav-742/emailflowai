/**
 * ImapConnector.js — Universal IMAP Sync Engine
 *
 * Connects to any IMAP-compliant mail server using ImapFlow.
 * Supports Gmail (App Password), Outlook, Yahoo, Zoho, cPanel, custom domains.
 * All credentials are decrypted at runtime from AES-256-GCM encrypted storage.
 *
 * Features:
 *   - Incremental delta sync via IMAP UID tracking
 *   - Full initial sync with configurable limit
 *   - Message body parsing via postal-mime
 *   - Folder listing
 */

const { ImapFlow } = require('imapflow');
const { decrypt } = require('../../utils/encryption');

class ImapConnector {
  constructor(account) {
    this.account = account;
  }

  /**
   * Build an authenticated ImapFlow client from stored encrypted credentials.
   */
  _buildClient() {
    const password = decrypt(this.account.imapPassword);

    return new ImapFlow({
      host: this.account.imapHost,
      port: this.account.imapPort || 993,
      secure: (this.account.imapPort || 993) === 993,
      auth: {
        user: this.account.imapUsername || this.account.email,
        pass: password,
      },
      logger: false,
      emitLogs: false,
      tls: {
        rejectUnauthorized: true,
      },
    });
  }

  /**
   * Fetch the latest emails from INBOX.
   *
   * @param {number}      limit     Max emails to retrieve (default 25)
   * @param {number|null} sinceUid  Resume incremental sync from this UID
   * @returns {Promise<{emails: Array, lastUid: number|null}>}
   */
  async fetchLatestEmails(limit = 25, sinceUid = null) {
    const client = this._buildClient();
    const emails = [];
    let lastUid = sinceUid;

    try {
      await client.connect();

      const lock = await client.getMailboxLock('INBOX');

      try {
        // Build search range — either incremental or latest N messages
        let range;
        if (sinceUid && sinceUid > 0) {
          range = `${sinceUid + 1}:*`;
        } else {
          // Fetch the newest messages by sequence number
          const status = await client.status('INBOX', { messages: true });
          const total = status.messages || 0;
          const start = Math.max(1, total - limit + 1);
          range = `${start}:*`;
        }

        const messages = client.fetch(range, {
          uid: true,
          envelope: true,
          bodyStructure: true,
          source: { maxBytes: 256 * 1024 }, // 256 KB max per message source
          flags: true,
          labels: true,
          internalDate: true,
        }, { uid: !!sinceUid });

        let count = 0;
        for await (const message of messages) {
          if (count >= limit) break;

          const parsed = this._formatMessage(message);
          if (parsed) {
            emails.push(parsed);
            if (message.uid && (!lastUid || message.uid > lastUid)) {
              lastUid = message.uid;
            }
          }
          count++;
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (error) {
      // Ensure we always close cleanly
      try { await client.logout(); } catch (_) { /* ignore */ }
      throw error;
    }

    return { emails, lastUid };
  }

  /**
   * List available IMAP folders/mailboxes.
   */
  async listFolders() {
    const client = this._buildClient();
    const folders = [];

    try {
      await client.connect();
      const mailboxes = await client.list();
      for (const box of mailboxes) {
        folders.push({
          name: box.name,
          path: box.path,
          specialUse: box.specialUse || null,
          delimiter: box.delimiter,
        });
      }
      await client.logout();
    } catch (error) {
      try { await client.logout(); } catch (_) { /* ignore */ }
      throw error;
    }

    return folders;
  }

  /**
   * Test the IMAP connection credentials.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    const client = this._buildClient();

    try {
      await client.connect();
      const status = await client.status('INBOX', { messages: true });
      await client.logout();
      return { success: true, totalMessages: status.messages || 0 };
    } catch (error) {
      try { await client.logout(); } catch (_) { /* ignore */ }
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse a raw ImapFlow message into a normalized email object.
   */
  _formatMessage(msg) {
    if (!msg || !msg.envelope) return null;

    const envelope = msg.envelope;
    const fromAddr = envelope.from?.[0];
    const toAddrs = envelope.to || [];

    return {
      messageId: envelope.messageId || `imap-${msg.uid}`,
      imapUid: msg.uid,
      subject: envelope.subject || '(No Subject)',
      sender: fromAddr ? (fromAddr.address || '') : '',
      senderName: fromAddr ? (fromAddr.name || '') : '',
      recipients: toAddrs.map(r => r.address).filter(Boolean),
      receivedAt: msg.internalDate || envelope.date || new Date(),
      body: msg.source ? msg.source.toString('utf-8') : '',
      flags: Array.from(msg.flags || []),
      isRead: msg.flags?.has('\\Seen') || false,
      isSent: false,
      labels: msg.labels ? Array.from(msg.labels) : [],
    };
  }
}

module.exports = ImapConnector;
