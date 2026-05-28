/**
 * otpAuthController.js — Production-Grade OTP Authentication Controller
 *
 * Implements:
 *   - Secure Email + OTP SignUp & Login Pipeline
 *   - Advanced email validation (MX record check & disposable email blocking)
 *   - Rate limiting & cooldown management
 *   - Token generation & refresh token rotation (AuthSessions)
 *   - Session audit logging (AuthLogs)
 */

const dns = require('dns').promises;
const prisma = require('../config/database');
const otpService = require('../services/otpService');
const tokenService = require('../services/tokenService');
const { otpMailQueue } = require('../queues/otpMail.queue');

// List of blacklisted disposable email domains
const DISPOSABLE_DOMAINS = new Set([
  'yopmail.com', 'mailinator.com', 'tempmail.com', '10minutemail.com',
  'getairmail.com', 'guerrillamail.com', 'dispostable.com', 'sharklasers.com',
  'generator.email', 'maildrop.cc', 'trashmail.com', 'mailnesia.com'
]);

/**
 * Validate email syntax, disposable check, and active MX records.
 */
async function validateEmail(email) {
  const normalized = email.toLowerCase().trim();
  
  // 1. Basic Syntax Check
  const syntaxCheck = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!syntaxCheck) {
    return { valid: false, reason: 'Invalid email syntax format.' };
  }

  const domain = normalized.split('@')[1];

  // 2. Disposable Email Check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Disposable email addresses are not allowed.' };
  }

  // 3. DNS MX Record Verification
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, reason: 'No active mail exchangers (MX) found for this domain.' };
    }
  } catch (dnsErr) {
    // In local development we can proceed if DNS resolution fails due to internet issues
    if (process.env.NODE_ENV === 'production') {
      console.error(`DNS check failed for domain ${domain}:`, dnsErr.message);
      return { valid: false, reason: 'Could not verify active mail servers for this email domain.' };
    }
  }

  return { valid: true };
}

/**
 * Log an authentication event to the database.
 */
async function logAuthEvent(email, action, success, req) {
  try {
    await prisma.authLog.create({
      data: {
        email: email.toLowerCase().trim(),
        action,
        success,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null
      }
    });
  } catch (err) {
    console.error('⚠️ [AuthLog] Failed to write audit log:', err.message);
  }
}

/**
 * POST /api/auth/register-otp (maps from legacy / legacy SignUp page helper)
 * POST /api/auth/request-otp (Unified API)
 * Generates an OTP, hashes it, saves it in Redis, and dispatches the SMTP job to BullMQ.
 */
async function registerAndSendOtp(req, res) {
  const { name, email, password, type = 'login' } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || 'Unknown Client';

  try {
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    // 1. Thorough Validation Check
    const emailCheck = await validateEmail(email);
    if (!emailCheck.valid) {
      await logAuthEvent(email, 'otp_request_failed_validation', false, req);
      return res.status(400).json({ error: emailCheck.reason });
    }

    // 2. Cooldown check
    const isCooled = await otpService.checkResendCooldown(email);
    if (isCooled) {
      return res.status(429).json({ error: 'Verification code resent too quickly. Please wait 60 seconds.' });
    }

    // Check if registering a new user with a password, enforce length
    if (type === 'signup' && password && password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // 3. Generate Cryptographically Secure OTP
    const otp = otpService.generateOTP();

    // 4. Hash and store in Redis (5-min TTL)
    await otpService.storeOTP(email, otp, type, { name, password });

    // Set 60-second resend cooldown
    await otpService.setResendCooldown(email);

    // 5. Dispatch async SMTP delivery job to BullMQ
    await otpMailQueue.add('send-otp', {
      email,
      otp,
      name,
      type,
      ipAddress: clientIp,
      deviceInfo: userAgent
    });

    // 6. Log session request
    await logAuthEvent(email, `otp_request_${type}`, true, req);

    console.log(`🚀 [Auth API] Queued OTP delivery job for ${email}`);

    res.json({
      message: 'Verification code successfully sent to your inbox.'
    });
  } catch (error) {
    console.error('[RequestOTP] Error:', error);
    res.status(500).json({ error: 'Failed to request verification code. Please try again.' });
  }
}

/**
 * POST /api/auth/verify-otp
 * Verifies the bcrypt hash of the OTP in Redis, creates/updates user, and issues secure session tokens.
 */
async function verifyOtpHandler(req, res) {
  const { email, otp } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || 'Unknown Client';

  try {
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    // 1. Verify OTP with Redis Service
    const check = await otpService.verifyStoredOTP(email, otp);
    if (!check.valid) {
      await logAuthEvent(email, 'otp_verify_failed', false, req);
      return res.status(400).json({ error: check.reason });
    }

    const { entry } = check;

    // 2. Load or create user in DB
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      // Create user (Sign up flow completes)
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          name: entry.metadata.name || email.split('@')[0],
          oauthProvider: 'email',
          emailVerified: true,
          lastLogin: new Date()
        }
      });
      await logAuthEvent(email, 'signup_success', true, req);
    } else {
      // Existing user (Login flow completes)
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          lastLogin: new Date()
        }
      });
      await logAuthEvent(email, 'login_success', true, req);
    }

    // 3. Issue Session Tokens
    const accessToken = tokenService.generateAccessToken(user);
    const refreshToken = await tokenService.createSession(user.id, clientIp, { userAgent });

    // 4. Record successful audit event
    await logAuthEvent(email, 'otp_verify_success', true, req);

    res.json({
      token: accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan || 'free'
      }
    });
  } catch (error) {
    console.error('[VerifyOTP] Error:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
}

/**
 * POST /api/auth/resend-otp
 * Handles resending OTP, respecting cooldowns and throttling.
 */
async function resendOtp(req, res) {
  const { email, type = 'login' } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || 'Unknown Client';

  try {
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    // 1. Cooldown check
    const isCooled = await otpService.checkResendCooldown(email);
    if (isCooled) {
      return res.status(429).json({ error: 'Verification code resent too quickly. Please wait 60 seconds.' });
    }

    // 2. Fetch existing session to maintain same metadata
    const redisKey = `otp:auth:${email.toLowerCase().trim()}`;
    const entryStr = await otpService.verifyStoredOTP(email, ''); // Let verification trigger check
    
    // Fallback if session expired, we'll generate brand new
    const otp = otpService.generateOTP();
    await otpService.storeOTP(email, otp, type);
    await otpService.setResendCooldown(email);

    // 3. Dispatch to BullMQ Queue
    await otpMailQueue.add('send-otp', {
      email,
      otp,
      name: '',
      type,
      ipAddress: clientIp,
      deviceInfo: userAgent
    });

    await logAuthEvent(email, 'otp_resend', true, req);

    res.json({
      message: 'A fresh verification code has been dispatched.'
    });
  } catch (error) {
    console.error('[ResendOTP] Error:', error);
    res.status(500).json({ error: 'Failed to resend verification code. Please try again.' });
  }
}

/**
 * POST /api/auth/refresh
 * Performs safe Refresh Token Rotation.
 */
async function refreshSession(req, res) {
  const { refreshToken } = req.body;
  const clientIp = req.ip || req.headers['x-forwarded-for'] || null;
  const userAgent = req.headers['user-agent'] || 'Unknown Client';

  try {
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    const rotated = await tokenService.rotateSession(refreshToken, clientIp, { userAgent });
    
    await logAuthEvent(rotated.user.email, 'session_refresh', true, req);

    res.json(rotated);
  } catch (error) {
    console.error('[RefreshToken] Error:', error.message);
    res.status(401).json({ error: error.message || 'Session refresh failed.' });
  }
}

/**
 * POST /api/auth/logout
 * Revokes the database-backed refresh session.
 */
async function logout(req, res) {
  const { refreshToken } = req.body;

  try {
    if (refreshToken) {
      await tokenService.revokeSession(refreshToken);
    }
    
    if (req.user?.email) {
      await logAuthEvent(req.user.email, 'logout', true, req);
    }

    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('[Logout] Error:', error);
    res.status(500).json({ error: 'Logout failed.' });
  }
}

module.exports = {
  registerAndSendOtp,
  verifyOtpHandler,
  resendOtp,
  refreshSession,
  logout
};
