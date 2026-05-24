const prisma = require('../config/database');
const { getAuthClient } = require('../lib/google/getAuthClient');

const REFRESH_BUFFER_MS = 10 * 60 * 1000;

async function refreshGoogleAccountToken(userId, accountId) {
  const account = await prisma.emailAccount.findFirst({
    where: {
      id: accountId,
      userId,
      provider: 'google',
    },
    select: {
      id: true,
      email: true,
      tokenExpiry: true,
      requiresReconnect: true,
    },
  });

  if (!account) {
    throw new Error('Google account not found for token refresh.');
  }

  if (account.requiresReconnect) {
    return { refreshed: false, reason: 'requires_reconnect', accountId: account.id };
  }

  if (account.tokenExpiry && account.tokenExpiry.getTime() > Date.now() + REFRESH_BUFFER_MS) {
    return { refreshed: false, reason: 'token_still_valid', accountId: account.id };
  }

  await getAuthClient(userId, account.email);
  return { refreshed: true, accountId: account.id, email: account.email };
}

async function refreshExpiringGoogleTokens(limit = 100) {
  const accounts = await prisma.emailAccount.findMany({
    where: {
      provider: 'google',
      syncEnabled: true,
      requiresReconnect: false,
      OR: [
        { tokenExpiry: null },
        { tokenExpiry: { lte: new Date(Date.now() + REFRESH_BUFFER_MS) } },
      ],
    },
    select: {
      id: true,
      userId: true,
    },
    take: limit,
    orderBy: { tokenExpiry: 'asc' },
  });

  const results = [];
  for (const account of accounts) {
    try {
      results.push(await refreshGoogleAccountToken(account.userId, account.id));
    } catch (error) {
      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { requiresReconnect: true },
      });
      results.push({ refreshed: false, accountId: account.id, error: error.message });
    }
  }

  return results;
}

module.exports = {
  refreshExpiringGoogleTokens,
  refreshGoogleAccountToken,
};
