/**
 * otpMail.worker.js — BullMQ Worker for OTP Email Delivery
 *
 * Processes jobs from the 'otp-mail-delivery' queue.
 * Integrates Nodemailer with pooled connections, retries, and branded templates.
 */

const { Worker } = require('bullmq');
const nodemailer = require('nodemailer');
const { redisConnection } = require('../config/redis');

// Initialize Nodemailer pooled transporter
let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const secure = process.env.SMTP_SECURE === 'true' || port === '465';
  const user = process.env.SMTP_USER || process.env.GMAIL_APP_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;

  if (host) {
    console.log(`✉️ [OTP Worker] Initializing SMTP pooled transport to ${host}:${port}`);
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port || '465', 10),
      secure,
      auth: { user, pass },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  } else if (process.env.GMAIL_APP_USER && process.env.GMAIL_APP_PASS) {
    console.log('✉️ [OTP Worker] Initializing Gmail direct transport pooled config');
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_APP_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
    });
  } else {
    console.warn('⚠️ [OTP Worker] No SMTP configuration found in .env! Emails will fallback to CONSOLE ONLY.');
    transporter = false; // Disable nodemailer sending
  }

  return transporter;
}

const otpMailWorker = new Worker(
  'otp-mail-delivery',
  async (job) => {
    const { email, otp, name, type, ipAddress, deviceInfo } = job.data;
    console.log(`✉️ [OTP Worker] Processing job ${job.id} | Send OTP to: ${email} | Action: ${type}`);

    const mailer = getTransporter();
    const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER || process.env.GMAIL_APP_USER || 'EmailFlow AI <noreply@emailflowai.com>';

    const actionText = type === 'signup' ? 'complete your sign-up' : type === 'reset' ? 'reset your password' : 'verify your session';

    // Renders custom premium Glassmorphic HSL dark theme template
    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>EmailFlow AI Verification</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Plus+Jakarta+Sans:wght@400;600&display=swap');
          body {
            background-color: #030712;
            margin: 0;
            padding: 0;
            font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
            color: #d1d5db;
          }
          .email-container {
            max-width: 520px;
            margin: 40px auto;
            background: linear-gradient(145deg, #0f172a, #020617);
            border: 1px solid rgba(99, 102, 241, 0.15);
            border-radius: 20px;
            padding: 40px 30px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            text-align: center;
          }
          .brand-logo {
            font-family: 'Outfit', sans-serif;
            font-size: 26px;
            font-weight: 800;
            background: linear-gradient(135deg, #6366f1, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 24px;
            display: inline-block;
          }
          .header-title {
            font-family: 'Outfit', sans-serif;
            color: #ffffff;
            font-size: 22px;
            font-weight: 600;
            margin: 0 0 10px 0;
          }
          .description {
            font-size: 14px;
            color: #94a3b8;
            line-height: 1.6;
            margin: 0 0 24px 0;
          }
          .otp-card {
            background: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.25);
            border-radius: 16px;
            padding: 22px;
            margin: 0 auto 28px;
            max-width: 280px;
            box-shadow: 0 8px 32px 0 rgba(99, 102, 241, 0.05);
          }
          .otp-code {
            font-family: monospace;
            font-size: 40px;
            font-weight: 800;
            letter-spacing: 8px;
            color: #a78bfa;
            text-shadow: 0 0 15px rgba(167, 139, 250, 0.4);
            display: block;
            margin-left: 8px; /* Counteract letter-spacing shift */
          }
          .expiry-text {
            font-size: 12px;
            color: #64748b;
            margin-top: 8px;
            display: block;
          }
          .security-card {
            background: rgba(15, 23, 42, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 28px;
            text-align: left;
            font-size: 11px;
            color: #64748b;
            line-height: 1.5;
          }
          .security-card strong {
            color: #e2e8f0;
            display: block;
            margin-bottom: 6px;
          }
          .security-card code {
            font-family: monospace;
            color: #cbd5e1;
            background: rgba(255, 255, 255, 0.05);
            padding: 2px 4px;
            border-radius: 4px;
          }
          .footer-text {
            font-size: 12px;
            color: #475569;
            line-height: 1.5;
            margin: 0;
          }
          .copyright {
            margin-top: 30px;
            font-size: 11px;
            color: #334155;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="brand-logo">EmailFlow AI</div>
          <h2 class="header-title">Verify your email address</h2>
          <p class="description">
            Hi ${name || 'there'}, use the verification code below to ${actionText}. This code will expire in <strong>5 minutes</strong>.
          </p>
          
          <div class="otp-card">
            <span class="otp-code">${otp}</span>
            <span class="expiry-text">Expires in 5 minutes</span>
          </div>

          <div class="security-card">
            <strong>Verification Security Details:</strong>
            • Request IP Address: <code>${ipAddress || 'Unknown'}</code><br/>
            • Device Fingerprint: <code>${deviceInfo || 'Unknown'}</code><br/>
            • Request Time (UTC): <code>${new Date().toUTCString()}</code>
          </div>

          <p class="footer-text">
            If you did not request this authentication code, you can safely ignore this email. Someone else may have typed your address by mistake.
          </p>
          <div class="copyright">
            &copy; ${new Date().getFullYear()} EmailFlow AI. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;

    if (mailer) {
      try {
        await mailer.sendMail({
          from: fromAddress,
          to: email,
          subject: `[EmailFlow AI] Your Verification Code: ${otp}`,
          html: htmlTemplate,
          text: `Hi ${name || 'there'},\n\nUse this verification code to ${actionText}: ${otp}\n\nThis code expires in 5 minutes.\n\nIP: ${ipAddress || 'Unknown'}\nDevice: ${deviceInfo || 'Unknown'}`,
        });

        console.log(`✅ [OTP Worker] Email successfully delivered to ${email}`);
        return { success: true, email, method: 'smtp' };
      } catch (err) {
        console.error(`❌ [OTP Worker] SMTP connection failed to send: ${err.message}`);
        // Let it throw to trigger retry mechanics in BullMQ
        throw err;
      }
    } else {
      // Falling back to developer logging console log
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  🔧 [DEVELOPER OTP CAPTURE MODE]');
      console.log(`  📧 Target Email:   ${email}`);
      console.log(`  🔑 Generated OTP:   ${otp}`);
      console.log(`  ⚙️  Flow Type:      ${type}`);
      console.log(`  🛡️  Security IP:     ${ipAddress || 'Unknown'}`);
      console.log(`  📱 Security Client: ${deviceInfo || 'Unknown'}`);
      console.log('═══════════════════════════════════════════════════════════════');
      return { success: true, email, method: 'console_dev_fallback', devOtp: otp };
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

otpMailWorker.on('completed', (job, result) => {
  console.log(`✅ [OTP Worker] Job ${job.id} completed successfully.`, result);
});

otpMailWorker.on('failed', (job, err) => {
  console.error(`❌ [OTP Worker] Job ${job?.id} failed with error:`, err.message);
});

module.exports = { otpMailWorker };
