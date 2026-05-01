const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');
const prisma = require('../config/database');

/**
 * Synchronizes Outlook emails using Microsoft Graph API.
 */
async function syncOutlookEmails(accessToken, userId, accountId) {
  try {
    const client = Client.init({
      authProvider: (done) => done(null, accessToken)
    });

    // Fetch latest messages
    const response = await client.api('/me/messages')
      .select('id,subject,from,bodyPreview,receivedDateTime,conversationId,hasAttachments,isRead,importance')
      .top(50)
      .orderby('receivedDateTime DESC')
      .get();

    const messages = response.value || [];
    console.log(`[OutlookSync] Fetched ${messages.length} messages for user ${userId}`);

    const syncedEmails = [];

    for (const msg of messages) {
      const receivedAt = new Date(msg.receivedDateTime);
      const sender = msg.from?.emailAddress?.address || 'unknown@outlook.com';
      const senderName = msg.from?.emailAddress?.name || sender.split('@')[0];

      // Map importance to priority
      let priority = 'normal';
      if (msg.importance === 'high') priority = 'high';
      if (msg.importance === 'low') priority = 'low';

      const email = await prisma.email.upsert({
        where: { userId_messageId: { userId, messageId: msg.id } },
        update: {
          isRead: msg.isRead,
          receivedAt,
        },
        create: {
          id: `outlook_${msg.id}`,
          userId,
          accountId,
          messageId: msg.id,
          threadId: msg.conversationId,
          subject: msg.subject,
          snippet: msg.bodyPreview,
          sender,
          senderName,
          receivedAt,
          isRead: msg.isRead,
          priority,
          provider: 'outlook',
          category: 'focus_today', // Default to focus for now
        }
      });

      // Handle Thread grouping
      if (msg.conversationId) {
        await prisma.thread.upsert({
          where: { id: msg.conversationId },
          update: { lastReceivedAt: receivedAt },
          create: {
            id: msg.conversationId,
            userId,
            lastReceivedAt: receivedAt,
            category: 'focus_today'
          }
        });
      }

      syncedEmails.push(email);
    }

    return syncedEmails;
  } catch (error) {
    console.error(`[OutlookSync] Error for user ${userId}:`, error.message);
    throw error;
  }
}

module.exports = { syncOutlookEmails };
