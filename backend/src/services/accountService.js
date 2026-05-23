const prisma = require('../config/database');

function sanitizeAccount(account) {
  return {
    id: account.id,
    userId: account.userId,
    provider: account.provider,
    email: account.email,
    displayName: account.displayName,
    isPrimary: account.isPrimary,
    color: account.color,
    syncEnabled: account.syncEnabled,
    connectionType: account.connectionType,
    imapHost: account.imapHost,
    smtpHost: account.smtpHost,
    lastSyncAt: account.lastSyncAt,
    requiresReconnect: account.requiresReconnect,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    hasOAuthTokens: Boolean(account.accessToken || account.refreshToken),
    emailCount: account._count?.emails || 0,
  };
}

/**
 * List all connected email accounts for a user.
 */
async function listAccounts(userId) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId },
    include: {
      _count: { select: { emails: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return accounts.map(sanitizeAccount);
}

/**
 * Update account settings.
 */
async function updateAccount(accountId, data) {
  const { displayName, color, syncEnabled, isPrimary } = data;

  // If setting as primary, unset others for this user
  if (isPrimary) {
    const account = await prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { userId: true },
    });

    if (account) {
      await prisma.emailAccount.updateMany({
        where: { userId: account.userId },
        data: { isPrimary: false },
      });
    }
  }

  const updated = await prisma.emailAccount.update({
    where: { id: accountId },
    include: {
      _count: { select: { emails: true } },
    },
    data: {
      ...(displayName !== undefined && { displayName }),
      ...(color !== undefined && { color }),
      ...(syncEnabled !== undefined && { syncEnabled }),
      ...(isPrimary !== undefined && { isPrimary }),
    },
  });

  return sanitizeAccount(updated);
}

/**
 * Disconnect and remove an account.
 */
async function disconnectAccount(accountId) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      userId: true,
      email: true,
      provider: true,
      isPrimary: true,
    },
  });

  if (!account) {
    throw new Error('Account not found');
  }

  if (account.provider !== 'google') {
    return prisma.emailAccount.delete({
      where: { id: accountId },
    });
  }

  return prisma.$transaction(async (tx) => {
    await tx.oAuthToken.deleteMany({
      where: {
        userId: account.userId,
        email: account.email,
      },
    });

    const deletedAccount = await tx.emailAccount.delete({
      where: { id: accountId },
    });

    if (account.isPrimary) {
      const nextPrimary = await tx.emailAccount.findFirst({
        where: {
          userId: account.userId,
          provider: 'google',
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });

      if (nextPrimary) {
        await tx.emailAccount.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    }

    const user = await tx.user.findUnique({
      where: { id: account.userId },
      select: { email: true },
    });

    if (user?.email === account.email) {
      const [remainingAccount, remainingToken] = await Promise.all([
        tx.emailAccount.findFirst({
          where: {
            userId: account.userId,
            provider: 'google',
            OR: [
              { accessToken: { not: null } },
              { refreshToken: { not: null } },
            ],
          },
          select: { id: true },
        }),
        tx.oAuthToken.findFirst({
          where: { userId: account.userId },
          select: { id: true },
        }),
      ]);

      await tx.user.update({
        where: { id: account.userId },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiry: null,
          ...(remainingAccount || remainingToken ? {} : { gmailConnectedAt: null }),
        },
      });
    }

    return deletedAccount;
  });
}

module.exports = {
  listAccounts,
  updateAccount,
  disconnectAccount,
  sanitizeAccount,
};
