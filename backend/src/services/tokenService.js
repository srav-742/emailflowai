const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '1h'; // Short-lived access token
const REFRESH_TOKEN_TTL_DAYS = 30; // 30 days refresh token

/**
 * Generate a short-lived Access Token (JWT).
 */
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Create a new user session and store a secure Refresh Token in the database.
 */
async function createSession(userId, ipAddress, deviceInfo) {
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await prisma.authSession.create({
    data: {
      userId,
      refreshToken,
      ipAddress,
      deviceInfo,
      expiresAt
    }
  });

  return refreshToken;
}

/**
 * Perform refresh token rotation:
 * Verifies the old refresh token, deletes it, and issues a new Access & Refresh token pair.
 */
async function rotateSession(oldRefreshToken, ipAddress, deviceInfo) {
  // Find the active session in the database
  const session = await prisma.authSession.findUnique({
    where: { refreshToken: oldRefreshToken },
    include: { user: true }
  });

  if (!session) {
    throw new Error('Invalid refresh token session. Please log in again.');
  }

  // Check if session has expired
  if (new Date() > session.expiresAt) {
    await prisma.authSession.delete({ where: { id: session.id } });
    throw new Error('Refresh token has expired. Please log in again.');
  }

  // Generate a new secure refresh token
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  // Use a transaction to safely rotate the session: delete the old session and create a new one
  await prisma.$transaction([
    prisma.authSession.delete({
      where: { id: session.id }
    }),
    prisma.authSession.create({
      data: {
        userId: session.userId,
        refreshToken: newRefreshToken,
        ipAddress: ipAddress || session.ipAddress,
        deviceInfo: deviceInfo || session.deviceInfo,
        expiresAt
      }
    })
  ]);

  // Generate a fresh access token
  const accessToken = generateAccessToken(session.user);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      plan: session.user.plan || 'free'
    }
  };
}

/**
 * Revoke/delete a user session (Logout).
 */
async function revokeSession(refreshToken) {
  try {
    await prisma.authSession.delete({
      where: { refreshToken }
    });
    return true;
  } catch (error) {
    // If it's already deleted or doesn't exist, ignore
    return false;
  }
}

/**
 * Revoke all sessions for a user (Security lock).
 */
async function revokeAllUserSessions(userId) {
  await prisma.authSession.deleteMany({
    where: { userId }
  });
}

module.exports = {
  generateAccessToken,
  createSession,
  rotateSession,
  revokeSession,
  revokeAllUserSessions
};
