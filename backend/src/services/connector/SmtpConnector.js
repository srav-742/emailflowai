/**
 * SmtpConnector.js — Universal SMTP Send Engine
 *
 * Sends emails via SMTP using Nodemailer with encrypted credentials.
 * Supports any SMTP-compliant server including Gmail, Outlook, Yahoo, custom domains.
 * All passwords are decrypted at runtime from AES-256-GCM encrypted storage.
 */

const nodemailer = require('nodemailer');
const { decrypt } = require('../../utils/encryption');

class SmtpConnector {
  constructor(account) {
    this.account = account;
  }

  /**
   * Create a Nodemailer transporter with decrypted SMTP credentials.
   */
  _buildTransporter() {
    const password = decrypt(this.account.smtpPassword);
    const port = this.account.smtpPort || 587;

    return nodemailer.createTransport({
      host: this.account.smtpHost,
      port,
      secure: port === 465, // true for 465, false for 587 (STARTTLS)
      auth: {
        user: this.account.smtpUsername || this.account.email,
        pass: password,
      },
      tls: {
        rejectUnauthorized: true,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });
  }

  /**
   * Send an email via SMTP.
   *
   * @param {Object} params
   * @param {string|string[]} params.to       Recipient(s)
   * @param {string}          params.subject  Subject line
   * @param {string}          [params.body]   Plain text body
   * @param {string}          [params.html]   HTML body
   * @param {string|string[]} [params.cc]     CC recipients
   * @param {string|string[]} [params.bcc]    BCC recipients
   * @param {string}          [params.inReplyTo]   Message-ID being replied to
   * @param {string}          [params.references]  Thread references header
   * @param {Array}           [params.attachments] Nodemailer-compatible attachments
   * @returns {Promise<Object>} Nodemailer send result with messageId
   */
  async sendEmail({ to, subject, body, html, cc, bcc, inReplyTo, references, attachments }) {
    const transporter = this._buildTransporter();

    const fromName = this.account.displayName || this.account.email.split('@')[0];

    const mailOptions = {
      from: `"${fromName}" <${this.account.email}>`,
      to,
      subject,
      text: body,
      html: html || undefined,
      cc: cc || undefined,
      bcc: bcc || undefined,
      inReplyTo: inReplyTo || undefined,
      references: references || undefined,
      attachments: attachments || undefined,
    };

    const result = await transporter.sendMail(mailOptions);

    return {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
    };
  }

  /**
   * Test the SMTP connection credentials.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection() {
    const transporter = this._buildTransporter();

    try {
      await transporter.verify();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = SmtpConnector;
