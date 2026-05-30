const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
// In a real app, you would load this from process.env.TOKEN_ENCRYPTION_KEY
// Fallback to a deterministic key derived from SESSION_SECRET or JWT_SECRET for development, to ensure it doesn't break if not set.
const getEncryptionKey = () => {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.SESSION_SECRET || 'emailflow-default-secret-key-32b';
  // Ensure the key is exactly 32 bytes for aes-256-gcm
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a token string using AES-256-GCM.
 * @param {string} text - The token to encrypt.
 * @returns {string} - The encrypted string format: iv:authTag:encryptedData
 */
function encryptToken(text) {
  if (!text) return text;
  
  const iv = crypto.randomBytes(12); // GCM recommended IV size is 12 bytes
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a token string encrypted by encryptToken.
 * @param {string} encryptedText - The encrypted string format: iv:authTag:encryptedData
 * @returns {string} - The decrypted token.
 */
function decryptToken(encryptedText) {
  if (!encryptedText) return encryptedText;
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format');
    }
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting token:', error);
    throw new Error('Failed to decrypt token');
  }
}

module.exports = {
  encryptToken,
  decryptToken,
};
