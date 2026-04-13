/**
 * inboxSummaryService.js
 *
 * After each email-poll cycle, this service takes all newly‑arrived emails,
 * sends them to Groq in one shot, and returns a human-readable summary
 * that gets emitted over Socket.IO to the user's dashboard in real-time.
 */

const { summarizeBatchEmails } = require('../utils/xai');
const redis = require('../redisClient');


/**
 * Build and broadcast a batch AI summary for a set of new emails.
 *
 * @param {object}   io          - Socket.IO server instance
 * @param {object}   user        - { id, importantContacts }
 * @param {Array}    newEmails   - array of email records that just arrived
 * @returns {Promise<string>}    the summary text
 */
async function broadcastInboxSummary(io, user, newEmails) {
  if (!newEmails || newEmails.length === 0) return '';

  const cacheKey = `ai:summary:${user.id}:${newEmails.map(e => e.id).sort().join(',')}`;

  try {
    // 1. Check Redis Cache (Step 7.3)
    const cachedSummary = await redis.get(cacheKey);
    if (cachedSummary) {
      console.log('⚡ Redis Cache Hit: Returning cached AI summary');
      
      // Still broadcast even if cached, so the UI updates
      if (io && user?.id) {
        broadcastToSocket(io, user.id, cachedSummary, newEmails);
      }
      return cachedSummary;
    }

    // 2. Generate new summary
    const summaryText = await summarizeBatchEmails(newEmails);

    // 3. Store in Redis for 1 hour
    await redis.set(cacheKey, summaryText, 'EX', 3600);

    // 4. Emit to the specific user's Socket.IO room
    if (io && user?.id) {
      broadcastToSocket(io, user.id, summaryText, newEmails);
    }

    return summaryText;
  } catch (error) {
    console.error('[InboxSummary] Failed to generate batch summary:', error.message);
    return '';
  }
}

/** Helper to handle socket emission */
function broadcastToSocket(io, userId, summaryText, emails) {
  const { getUserSocketRoom } = require('../utils/socketRooms');
  io.to(getUserSocketRoom(userId)).emit('inbox-summary', {
    summary:    summaryText,
    emailCount: emails.length,
    syncedAt:   new Date().toISOString(),
    emails:     emails.map((e) => ({
      id:       e.id,
      subject:  e.subject,
      sender:   e.senderName || e.sender,
      category: e.category,
      priority: e.priority,
      summary:  e.summary || e.snippet || '',
    })),
  });
}

module.exports = { broadcastInboxSummary };
