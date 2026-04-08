const prisma = require('../config/database');
const { formatContactLabel } = require('../utils/contactUtils');

function flattenTasks(emails = []) {
  return emails.flatMap((email) =>
    Array.isArray(email.tasks)
      ? email.tasks
          .filter((task) => task && !task.completed)
          .map((task, index) => ({
            ...task,
            emailId: email.id,
            emailSubject: email.subject || 'Untitled email',
            contact: formatContactLabel(email.senderName || email.sender || email.recipients?.[0] || ''),
            taskKey: `${email.id}-${task.id || index}`,
          }))
      : [],
  );
}

function buildBriefSummary({ importantEmails, tasks, followUps }) {
  const parts = [];

  if (importantEmails.length) {
    parts.push(`${importantEmails.length} high-priority email${importantEmails.length > 1 ? 's are' : ' is'} waiting`);
  }

  if (tasks.length) {
    parts.push(`${tasks.length} open task${tasks.length > 1 ? 's were' : ' was'} extracted from email`);
  }

  if (followUps.length) {
    parts.push(`${followUps.length} follow-up reminder${followUps.length > 1 ? 's are' : ' is'} ready`);
  }

  return parts.length
    ? `${parts.join(', ')}.`
    : 'Your workspace is calm right now. No urgent emails, open follow-ups, or unfinished task suggestions are waiting.';
}

async function getMorningBrief(userId) {
  const [importantEmails, recentEmails, followUps] = await Promise.all([
    prisma.email.findMany({
      where: {
        userId,
        OR: [{ priority: 'high' }, { actionRequired: true }],
      },
      orderBy: [{ priority: 'desc' }, { receivedAt: 'desc' }],
      take: 5,
    }),
    prisma.email.findMany({
      where: {
        userId,
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    }),
    prisma.email.findMany({
      where: {
        userId,
        followUp: true,
      },
      orderBy: { followUpAt: 'desc' },
      take: 5,
    }),
  ]);

  const tasks = flattenTasks(recentEmails).slice(0, 6);
  const topEmail = importantEmails[0];
  const headline = topEmail
    ? `${formatContactLabel(topEmail.senderName || topEmail.sender || 'Unknown contact')} needs attention: ${topEmail.subject || 'Untitled email'}`
    : followUps[0]
      ? `A follow-up reminder is ready for ${formatContactLabel(followUps[0].recipients?.[0] || followUps[0].sender || 'your latest thread')}.`
      : 'Your morning brief is clear. No urgent email spikes are waiting right now.';

  return {
    headline,
    summary: buildBriefSummary({ importantEmails, tasks, followUps }),
    counts: {
      important: importantEmails.length,
      tasks: tasks.length,
      followUps: followUps.length,
    },
    importantEmails,
    tasks,
    followUps,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getMorningBrief,
};
