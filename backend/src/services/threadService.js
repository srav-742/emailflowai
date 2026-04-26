const prisma = require('../config/database');
const { summarizeThread } = require('../utils/xai');

/**
 * Updates or creates a Thread intelligence record for a given threadId.
 */
async function refreshThreadIntelligence(threadId, userId) {
  if (!threadId || !userId) return null;

  try {
    // 1. Fetch all emails in this thread
    const emails = await prisma.email.findMany({
      where: { threadId, userId },
      orderBy: { receivedAt: 'asc' },
    });

    if (!emails.length) return null;

    const lastEmail = emails[emails.length - 1];

    // 2. Ensure the Thread record exists (Placeholder if AI fails)
    let thread = await prisma.thread.upsert({
      where: { id: threadId },
      update: { lastReceivedAt: lastEmail.receivedAt },
      create: {
        id: threadId,
        userId,
        lastReceivedAt: lastEmail.receivedAt,
        summary: 'Summarizing conversation...',
      },
    });

    // 3. Generate thread-level summary
    const intelligence = await summarizeThread(emails);
    if (!intelligence) return thread;

    // 4. Update with full intelligence
    return await prisma.thread.update({
      where: { id: threadId },
      data: {
        summary: intelligence.formatted_briefing || intelligence.summary,
        priority: (intelligence.priority || 'normal').toLowerCase(),
        actionRequired: intelligence.action_required || false,
        company: intelligence.company,
        role: intelligence.role,
        deadline: intelligence.deadline,
      },
    });
  } catch (error) {
    console.error(`[ThreadService] Error refreshing thread ${threadId}:`, error.message);
    return null;
  }
}

module.exports = {
  refreshThreadIntelligence,
};
