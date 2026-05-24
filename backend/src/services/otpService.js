const crypto = require('crypto');
const bcrypt = require('bcrypt');
const redis = require('../redisClient');

const OTP_TTL = 300; // 5 minutes in seconds
const MAX_ATTEMPTS = 5;

/**
 * Generate a cryptographically secure 6-digit OTP code.
 */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash the generated OTP using bcrypt.
 */
async function hashOTP(otp) {
  return await bcrypt.hash(otp, 12);
}

/**
 * Store the hashed OTP and session metadata in Redis.
 * @param {string} email - The user's email address
 * @param {string} otp - The plaintext OTP
 * @param {string} type - The OTP flow type ('signup', 'login', 'reset', etc.)
 * @param {object} metadata - Extra details (e.g., name, password for signup)
 */
async function storeOTP(email, otp, type = 'login', metadata = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  const hash = await hashOTP(otp);
  
  const payload = {
    hash,
    attempts: 0,
    expiresAt: Date.now() + OTP_TTL * 1000,
    type,
    metadata
  };

  const redisKey = `otp:auth:${normalizedEmail}`;
  await redis.set(redisKey, JSON.stringify(payload), 'EX', OTP_TTL);
  
  // Return the plain OTP so it can be sent via mail queue
  return otp;
}

/**
 * Verify the OTP entered by the user.
 * @param {string} email - The user's email address
 * @param {string} code - The 6-digit code to verify
 */
async function verifyStoredOTP(email, code) {
  const normalizedEmail = email.toLowerCase().trim();
  const redisKey = `otp:auth:${normalizedEmail}`;
  
  const entryStr = await redis.get(redisKey);
  if (!entryStr) {
    return { valid: false, reason: 'No active OTP verification session found. Please request a new one.' };
  }

  const entry = JSON.parse(entryStr);

  // Check manual expiration (though Redis TTL acts as standard expiration)
  if (Date.now() > entry.expiresAt) {
    await redis.del(redisKey);
    return { valid: false, reason: 'Your verification code has expired. Please request a new one.' };
  }

  // Compare the OTP with the stored bcrypt hash
  const matches = await bcrypt.compare(code, entry.hash);
  
  if (!matches) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      await redis.del(redisKey);
      return { valid: false, reason: 'Too many incorrect attempts. This code has been invalidated.' };
    }
    
    // Update attempts back in Redis
    const remainingTTL = Math.max(1, Math.floor((entry.expiresAt - Date.now()) / 1000));
    await redis.set(redisKey, JSON.stringify(entry), 'EX', remainingTTL);
    
    return { 
      valid: false, 
      reason: `Incorrect code. You have ${MAX_ATTEMPTS - entry.attempts} attempts remaining.` 
    };
  }

  // Valid OTP! Remove it immediately to prevent reuse
  await redis.del(redisKey);
  return { valid: true, entry };
}

/**
 * Get or set the resend cooldown in Redis (60 seconds).
 */
async function setResendCooldown(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const cooldownKey = `otp:cooldown:${normalizedEmail}`;
  await redis.set(cooldownKey, '1', 'EX', 60);
}

/**
 * Check if the user is in a resend cooldown period.
 */
async function checkResendCooldown(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const cooldownKey = `otp:cooldown:${normalizedEmail}`;
  const cooldownExists = await redis.exists(cooldownKey);
  return cooldownExists === 1;
}

module.exports = {
  generateOTP,
  hashOTP,
  storeOTP,
  verifyStoredOTP,
  setResendCooldown,
  checkResendCooldown
};
