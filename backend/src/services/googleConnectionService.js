const prisma = require('../config/database');

const GOOGLE_RECONNECT_MESSAGE = 'Google access has expired or been revoked. Please reconnect Gmail.';

function getGoogleErrorText(error) {
  const parts = [
    error?.message,
    error?.response?.data?.error,
    error?.response?.data?.error_description,
    error?.response?.data?.error?.message,
    ...(Array.isArray(error?.errors) ? error.errors.map((entry) => entry?.message) : []),
  ];

  return parts
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' ');
}

function isGoogleRefreshTokenInvalid(error) {
  const text = getGoogleErrorText(error);

  return (
    text.includes('invalid_grant') ||
    text.includes('unauthorized_client') ||
    text.includes('token has been expired or revoked') ||
    text.includes('token has expired or been revoked') ||
    text.includes('revoked')
  );
}

function createReconnectError(message = GOOGLE_RECONNECT_MESSAGE) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

async function hasGoogleConnection(userId, fallbackUser = null) {
  if (fallbackUser?.accessToken || fallbackUser?.refreshToken) {
    return true;
  }

  const [account, token] = await Promise.all([
    prisma.emailAccount.findFirst({
      where: {
        userId,
        provider: 'google',
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
        ],
      },
      select: { id: true },
    }),
    prisma.oAuthToken.findFirst({
      where: { userId },
      select: { id: true },
    }),
  ]);

  return Boolean(account || token);
}

async function resolveGoogleAccountEmail(userId, accountId = null) {
  if (accountId) {
    const account = await prisma.emailAccount.findFirst({
      where: {
        id: accountId,
        userId,
        provider: 'google',
      },
      select: { email: true },
    });

    return account?.email || null;
  }

  const [user, connectedAccounts, oauthTokens] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        accessToken: true,
        refreshToken: true,
      },
    }),
    prisma.emailAccount.findMany({
      where: {
        userId,
        provider: 'google',
        OR: [
          { accessToken: { not: null } },
          { refreshToken: { not: null } },
        ],
      },
      select: { email: true, isPrimary: true },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' },
      ],
    }),
    prisma.oAuthToken.findMany({
      where: { userId },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const accountEmails = new Set(connectedAccounts.map((account) => account.email));
  const tokenEmails = new Set(oauthTokens.map((token) => token.email));

  if (user?.email && accountEmails.has(user.email)) {
    return user.email;
  }

  const primaryAccount = connectedAccounts.find((account) => account.isPrimary);
  if (primaryAccount?.email) {
    return primaryAccount.email;
  }

  if (connectedAccounts[0]?.email) {
    return connectedAccounts[0].email;
  }

  if (user?.email && tokenEmails.has(user.email)) {
    return user.email;
  }

  if (oauthTokens[0]?.email) {
    return oauthTokens[0].email;
  }

  if (user?.email && (user.accessToken || user.refreshToken)) {
    return user.email;
  }

  return null;
}

async function disableGoogleConnection(userId, email) {
  if (!userId || !email) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.oAuthToken.deleteMany({
      where: { userId, email },
    });

    await tx.emailAccount.updateMany({
      where: {
        userId,
        email,
        provider: 'google',
      },
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        syncEnabled: false,
      },
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user?.email === email) {
      const [remainingAccount, remainingToken] = await Promise.all([
        tx.emailAccount.findFirst({
          where: {
            userId,
            provider: 'google',
            OR: [
              { accessToken: { not: null } },
              { refreshToken: { not: null } },
            ],
          },
          select: { id: true },
        }),
        tx.oAuthToken.findFirst({
          where: { userId },
          select: { id: true },
        }),
      ]);

      await tx.user.update({
        where: { id: userId },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiry: null,
          ...(remainingAccount || remainingToken ? {} : { gmailConnectedAt: null }),
        },
      });
    }
  });
}

module.exports = {
  GOOGLE_RECONNECT_MESSAGE,
  createReconnectError,
  disableGoogleConnection,
  getGoogleErrorText,
  hasGoogleConnection,
  isGoogleRefreshTokenInvalid,
  resolveGoogleAccountEmail,
};
