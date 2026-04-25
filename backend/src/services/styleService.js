const prisma = require('../config/database');
const { analyzeWritingStyle } = require('../utils/xai');
const StyleExtractor = require('./StyleExtractor');

const STYLE_MIN_SAMPLES = Number(process.env.STYLE_MIN_SAMPLES || 5);
const STYLE_MAX_SAMPLES = Number(process.env.STYLE_MAX_SAMPLES || 20);

async function getStyleTrainingEmails(userId) {
  const sentEmails = await prisma.email.findMany({
    where: {
      userId,
      OR: [{ isSentByUser: true }, { isSent: true }],
      body: {
        not: null,
      },
    },
    orderBy: { receivedAt: 'desc' },
    take: 20,
    select: {
      body: true,
      subject: true,
      isEditedReply: true,
      isSentByUser: true,
      receivedAt: true,
    },
  });

  return sentEmails
    .map((email) => ({
      ...email,
      body: String(email.body || '').trim(),
      subject: String(email.subject || '').trim(),
    }))
    .filter((email) => email.body)
    .slice(0, STYLE_MAX_SAMPLES);
}

function buildStyleSamples(emails = []) {
  return emails.map((email) =>
    [
      `Subject: ${email.subject || 'Sent reply'}`,
      `Edited AI draft: ${email.isEditedReply ? 'yes' : 'no'}`,
      `Body: ${email.body}`,
    ].join('\n'),
  );
}

async function learnUserStyle(userId) {
  let profile;

  try {
    profile = await StyleExtractor.extractProfile(userId);
  } catch (error) {
    console.error('[StyleService] Deep profile extraction failed, falling back to sent-email analysis:', error.message || error);

    const sentEmails = await getStyleTrainingEmails(userId);
    const samples = buildStyleSamples(sentEmails);
    const fallbackProfile = await analyzeWritingStyle(samples);

    profile = {
      ...fallbackProfile,
      ready: sentEmails.length >= STYLE_MIN_SAMPLES,
      sampleCount: sentEmails.length,
      minSamples: STYLE_MIN_SAMPLES,
      lastExtraction: new Date().toISOString(),
    };
  }

  if (!profile.ready) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { style: true },
    });

    return {
      ready: false,
      style: user?.style || null,
      message: 'Still learning your style. Keep sending and editing replies!',
    };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { style: profile },
  });

  return {
    ready: true,
    style: user.style,
    message: 'Style profile refined with deep analysis.',
  };
}

async function refreshStyleProfileIfReady(userId) {
  const sentEmails = await getStyleTrainingEmails(userId);
  if (sentEmails.length < STYLE_MIN_SAMPLES) {
    return null;
  }

  return learnUserStyle(userId);
}

async function getOrCreateStyleProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      style: true,
    },
  });

  if (user?.style?.ready) {
    return user.style;
  }

  const trainingResult = await learnUserStyle(userId);
  return trainingResult.ready ? trainingResult.style : null;
}

module.exports = {
  learnUserStyle,
  refreshStyleProfileIfReady,
  getOrCreateStyleProfile,
  getStyleTrainingEmails,
  STYLE_MIN_SAMPLES,
};
