const prisma = require('../config/database');
const { analyzeWritingStyle } = require('../utils/groq');

async function learnUserStyle(userId) {
  const sentEmails = await prisma.email.findMany({
    where: {
      userId,
      isSent: true,
      body: {
        not: null,
      },
    },
    orderBy: { receivedAt: 'desc' },
    take: 20,
    select: {
      body: true,
    },
  });

  const samples = sentEmails
    .map((email) => String(email.body || '').trim())
    .filter(Boolean)
    .slice(0, 20);

  const style = {
    ...(await analyzeWritingStyle(samples)),
    updatedAt: new Date().toISOString(),
  };

  const user = await prisma.user.update({
    where: { id: userId },
    data: { style },
  });

  return user.style;
}

async function getOrCreateStyleProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      style: true,
    },
  });

  if (user?.style) {
    return user.style;
  }

  return learnUserStyle(userId);
}

module.exports = {
  learnUserStyle,
  getOrCreateStyleProfile,
};
