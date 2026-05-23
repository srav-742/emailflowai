/**
 * clerk.js — Clerk SDK Configuration
 *
 * Initializes the Clerk backend SDK for JWT verification
 * and user management. Used by the auth middleware to validate
 * Clerk-issued session tokens.
 *
 * Required env vars:
 *   CLERK_SECRET_KEY       — Backend API key from Clerk dashboard
 *   CLERK_PUBLISHABLE_KEY  — Frontend publishable key (for reference)
 */

let clerkClient = null;

try {
  const { createClerkClient } = require('@clerk/clerk-sdk-node');

  const secretKey = process.env.CLERK_SECRET_KEY;

  if (secretKey) {
    clerkClient = createClerkClient({
      secretKey,
    });
    console.log('[Clerk] SDK initialized successfully');
  } else {
    console.warn('[Clerk] CLERK_SECRET_KEY not set — Clerk auth disabled, falling back to Firebase/JWT');
  }
} catch (error) {
  console.warn('[Clerk] SDK not available:', error.message);
}

/**
 * Verify a Clerk session token (JWT).
 * Returns the decoded session claims if valid.
 */
async function verifyClerkToken(token) {
  if (!clerkClient) {
    throw new Error('Clerk is not initialized. Set CLERK_SECRET_KEY env var.');
  }

  try {
    const { data: session } = await clerkClient.verifyToken(token);
    return session;
  } catch (error) {
    console.error('[Clerk] Token verification failed:', error.message);
    throw error;
  }
}

/**
 * Get a Clerk user by their Clerk user ID.
 */
async function getClerkUser(clerkUserId) {
  if (!clerkClient) {
    throw new Error('Clerk is not initialized.');
  }

  return clerkClient.users.getUser(clerkUserId);
}

module.exports = {
  clerkClient,
  verifyClerkToken,
  getClerkUser,
};
