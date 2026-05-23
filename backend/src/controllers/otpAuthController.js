const crypto = require('crypto');
const prisma = require('../config/database');
const { generateToken } = require('../utils/jwt');

// ──────────────────────────────────────────────────────────
// In-memory OTP store (production → use Redis / DB table)
// ──────────────────────────────────────────────────────────
const otpStore = new Map(); // key: email, value: { otp, expiresAt, name, password }

function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function storeOTP(email, otp, extra = {}) {
  otpStore.set(email.toLowerCase(), {
    otp,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    ...extra,
  });
}

function verifyStoredOTP(email, code) {
  const entry = otpStore.get(email.toLowerCase());
  if (!entry) return { valid: false, reason: 'No OTP found. Please request a new one.' };
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return { valid: false, reason: 'OTP has expired. Please request a new one.' };
  }
  if (entry.otp !== code) return { valid: false, reason: 'Invalid OTP code.' };
  return { valid: true, entry };
}

// ──────────────────────────────────────────────────────────
// Email sender (uses nodemailer if available, falls back to console log)
// ──────────────────────────────────────────────────────────
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  try {
    const nodemailer = require('nodemailer');

    if (process.env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    } else if (process.env.GMAIL_APP_USER && process.env.GMAIL_APP_PASS) {
      // Gmail app password shortcut
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_APP_USER,
          pass: process.env.GMAIL_APP_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    } else {
      console.log('[OTP] No SMTP/Gmail config found. OTPs will be logged to console only.');
      return null;
    }

    return transporter;
  } catch {
    console.log('[OTP] nodemailer not installed. OTPs will be logged to console.');
    return null;
  }
}

async function sendOTPEmail(email, otp, name) {
  const mailer = getTransporter();
  const fromAddress = process.env.SMTP_FROM || process.env.GMAIL_APP_USER || 'noreply@emailflow.ai';

  if (mailer) {
    try {
      await mailer.sendMail({
        from: `"EmailFlow AI" <${fromAddress}>`,
        to: email,
        subject: `Your EmailFlow AI verification code: ${otp}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0f23; color: #f0f2ff; border-radius: 16px; overflow: hidden; border: 1px solid rgba(99,102,241,0.2);">
            <div style="padding: 32px 28px 20px; text-align: center;">
              <div style="display: inline-block; width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; font-weight: 800; font-size: 18px; line-height: 48px; margin-bottom: 16px;">EF</div>
              <h2 style="margin: 0 0 8px; font-size: 22px; color: #f0f2ff;">Verify your email</h2>
              <p style="margin: 0; font-size: 14px; color: #9298c0;">Hi ${name || 'there'}, use this code to complete your sign-up.</p>
            </div>
            <div style="padding: 12px 28px 24px; text-align: center;">
              <div style="display: inline-block; letter-spacing: 0.5em; font-size: 36px; font-weight: 700; color: #a78bfa; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.3); border-radius: 12px; padding: 16px 28px; margin: 8px 0 16px;">${otp}</div>
              <p style="margin: 0; font-size: 13px; color: #6b7199;">This code expires in 10 minutes.</p>
            </div>
            <div style="padding: 16px 28px; font-size: 12px; color: #6b7199; border-top: 1px solid rgba(99,102,241,0.15); text-align: center;">
              If you didn't request this code, please ignore this email.
            </div>
          </div>
        `,
        text: `Your EmailFlow AI verification code is: ${otp}\n\nThis code expires in 10 minutes.`,
      });
      console.log(`[OTP] Verification email sent to ${email}`);
      return true;
    } catch (mailErr) {
      console.error('[OTP] Failed to send email:', mailErr.message);
      // Fall through to console log
    }
  }

  // Fallback: log to console (development mode)
  console.log('═══════════════════════════════════════════');
  console.log(`  📧 OTP for ${email}: ${otp}`);
  console.log('═══════════════════════════════════════════');
  return true;
}

// ──────────────────────────────────────────────────────────
// Route handlers
// ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/register-otp
 * Creates a pending registration and sends OTP to the email.
 */
async function registerAndSendOtp(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check if user already exists but allow re-sending OTP
    const existingUser = await prisma.user.findUnique({ where: { email } });

    const otp = generateOTP();
    storeOTP(email, otp, { name, password });

    await sendOTPEmail(email, otp, name);

    const message = existingUser
      ? 'Verification code sent to your email.'
      : 'Account created! Check your email for the verification code.';

    // Expose OTP in JSON during development so user is never blocked by SMTP delivery delays
    res.json({ 
      message, 
      devOtp: process.env.NODE_ENV === 'development' ? otp : undefined 
    });
  } catch (error) {
    console.error('[RegisterOTP] Error:', error);
    res.status(500).json({ error: 'Failed to process registration. Please try again.' });
  }
}

/**
 * POST /api/auth/verify-otp
 * Verifies the OTP and finalizes account creation. Returns JWT.
 */
async function verifyOtpHandler(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const { valid, reason, entry } = verifyStoredOTP(email, otp);
    if (!valid) {
      return res.status(400).json({ error: reason });
    }

    // Clean up OTP
    otpStore.delete(email.toLowerCase());

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: entry.name || email.split('@')[0],
          oauthProvider: 'email',
          lastLogin: new Date(),
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: entry.name || user.name,
          lastLogin: new Date(),
        },
      });
    }

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan || 'free',
      },
    });
  } catch (error) {
    console.error('[VerifyOTP] Error:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}

/**
 * POST /api/auth/resend-otp
 * Resends the OTP to the given email.
 */
async function resendOtp(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const existing = otpStore.get(email.toLowerCase());
    const name = existing?.name || '';

    const otp = generateOTP();
    storeOTP(email, otp, { name, password: existing?.password });

    await sendOTPEmail(email, otp, name);

    res.json({ 
      message: 'Verification code sent.',
      devOtp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  } catch (error) {
    console.error('[ResendOTP] Error:', error);
    res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
  }
}

module.exports = {
  registerAndSendOtp,
  verifyOtpHandler,
  resendOtp,
};
