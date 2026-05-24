/**
 * otpRateLimit.js — Redis-backed rate limiting for OTP operations
 *
 * Implements strict abuse prevention:
 *   - Send OTP: Max 5 requests per hour per email
 *   - Verify OTP: Max 10 attempts per 15 minutes per email
 *   - IP-based: Max 50 authentication requests per hour per IP address
 */

const { rateLimit } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const redis = require('../redisClient');

// Helper to normalized email from body
const getEmailKey = (req) => {
  const email = req.body.email || req.query.email || '';
  return email.toLowerCase().trim();
};

/**
 * 1. Request OTP Limiter
 * Limits to 5 OTP generation requests per hour per email address
 */
const requestOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const email = getEmailKey(req);
    return email ? `email:${email}` : `ip:${req.ip}`;
  },
  store: new RedisStore({
    // @ts-expect-error - Known issue: the `rate-limit-redis` package has slightly different type expectations
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:otp_request:',
  }),
  message: {
    error: 'Too many verification code requests. You can only request 5 codes per hour. Please try again later.'
  }
});

/**
 * 2. Verify OTP Limiter
 * Limits to 10 verification attempts per 15 minutes per email address
 */
const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const email = getEmailKey(req);
    return email ? `email:${email}` : `ip:${req.ip}`;
  },
  store: new RedisStore({
    // @ts-expect-error - Known issue: the `rate-limit-redis` package has slightly different type expectations
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:otp_verify:',
  }),
  message: {
    error: 'Too many verification attempts. This session has been locked for 15 minutes for your security. Please try again later.'
  }
});

/**
 * 3. IP Auth Limiter
 * Limits total authentication requests to 50 per hour per IP address
 */
const ipAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip,
  store: new RedisStore({
    // @ts-expect-error - Known issue: the `rate-limit-redis` package has slightly different type expectations
    sendCommand: (...args) => redis.call(...args),
    prefix: 'rl:ip_auth:',
  }),
  message: {
    error: 'Authentication rate limit exceeded for this IP. Please try again after an hour.'
  }
});

module.exports = {
  requestOtpLimiter,
  verifyOtpLimiter,
  ipAuthLimiter
};
