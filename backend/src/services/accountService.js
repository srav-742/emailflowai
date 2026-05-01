const prisma = require('../config/database');

/**
 * List all connected email accounts for a user.
 */
async function listAccounts(userId) {
  return prisma.emailAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
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

  return prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      ...(displayName !== undefined && { displayName }),
      ...(color !== undefined && { color }),
      ...(syncEnabled !== undefined && { syncEnabled }),
      ...(isPrimary !== undefined && { isPrimary }),
    },
  });
}

/**
 * Disconnect and remove an account.
 */
async function disconnectAccount(accountId) {
  // We do a soft-ish delete by removing tokens, or a hard delete if requested.
  // Usually, keeping the emails but removing the connection is safer.
  // For now, we remove the record to follow the user request.
  return prisma.emailAccount.delete({
    where: { id: accountId },
  });
}

module.exports = {
  listAccounts,
  updateAccount,
  disconnectAccount,
};
