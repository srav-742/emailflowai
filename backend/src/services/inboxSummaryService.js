/**
 * inboxSummaryService.js
 * Emits production-level structured intelligence to the dashboard.
 */

const { summarizeBatchEmails } = require('../utils/xai');
const redis = require('../redisClient');

async function broadcastInboxSummary(io, user, newEmails) {
  if (!newEmails || newEmails.length === 0) return null;

  const cacheKey = `ai:briefing:v3:${user.id}:${newEmails.map(e => e.id).sort().join(',')}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (io && user?.id) broadcastToSocket(io, user.id, parsed, newEmails);
      return parsed;
    }

    const briefing = await summarizeBatchEmails(newEmails, user.id);
    await redis.set(cacheKey, JSON.stringify(briefing), 'EX', 3600);

    if (io && user?.id) broadcastToSocket(io, user.id, briefing, newEmails);
    return briefing;
  } catch (error) {
    console.error('[BriefingService] Error:', error.message);
    return null;
  }
}

function broadcastToSocket(io, userId, briefing, emails) {
  const { getUserSocketRoom } = require('../utils/socketRooms');
  
  io.to(getUserSocketRoom(userId)).emit('inbox-summary', {
    ...briefing,
    emailCount: emails.length,
    syncedAt: new Date().toISOString()
  });
}

module.exports = { broadcastInboxSummary };
