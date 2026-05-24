/**
 * Conversation Graph & Thread Synchronization Engine
 * Maps various provider thread contexts into a unified conversation timeline.
 */
const crypto = require('crypto');
const prisma = require('../config/database');

class ThreadSyncEngine {
  /**
   * Synchronizes an incoming normalized message into the Conversation Graph database
   * @param {Object} normalized - The standardized message envelope
   * @param {String} userId - The associated user ID
   * @returns {Object} The synchronised DB Message and Conversation records
   */
  static async syncMessage(normalized, userId) {
    if (!userId) {
      throw new Error('[ThreadSyncEngine] userId is required for synchronization.');
    }

    const { channel, sender, recipient, content, attachments, thread_id, metadata } = normalized;

    // 1. Identify or create unified conversation node
    let conversation = await this.findExistingConversation(channel, thread_id, sender.id, userId);

    if (!conversation) {
      conversation = await this.createConversation({
        userId,
        unifiedThreadId: thread_id || `thread_${crypto.randomBytes(8).toString('hex')}`,
        primaryChannel: channel,
        participants: [sender]
      });
    } else {
      // Update participants list if new sender is seen
      const currentParticipants = Array.isArray(conversation.participants) ? conversation.participants : [];
      const hasSender = currentParticipants.some(p => p.id === sender.id || p.email === sender.id);
      
      let updatedParticipants = [...currentParticipants];
      if (!hasSender) {
        updatedParticipants.push(sender);
      }

      conversation = await this.updateConversation(conversation.id, {
        participants: updatedParticipants
      });
    }

    // 2. Insert normalized message linked to conversation
    const messageId = crypto.randomUUID();
    const createdMessage = await prisma.$executeRawUnsafe(`
      INSERT INTO messages (id, conversation_id, channel_type, external_message_id, sender, content, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
      RETURNING *;
    `, 
      messageId,
      conversation.id,
      channel,
      metadata.sms_sid || metadata.whatsapp_sid || metadata.message_id || messageId,
      JSON.stringify(sender),
      JSON.stringify(content),
      JSON.stringify(metadata || {}),
      new Date()
    );

    return {
      conversation,
      message: {
        id: messageId,
        conversation_id: conversation.id,
        channel_type: channel,
        sender,
        content,
        metadata
      }
    };
  }

  /**
   * Performs advanced cross-channel heuristics to find a related timeline
   */
  static async findExistingConversation(channel, threadId, senderId, userId) {
    try {
      // Find exact thread ID matches first
      const exactResults = await prisma.$queryRawUnsafe(`
        SELECT * FROM conversations
        WHERE user_id = $1::uuid AND (
          unified_thread_id = $2 OR
          primary_channel = $3 AND unified_thread_id = $4
        )
        LIMIT 1;
      `, userId, threadId, channel, threadId);

      if (exactResults && exactResults.length > 0) {
        return exactResults[0];
      }

      // Heuristic: SMS and WhatsApp sharing the same sender ID (phone number)
      if (channel === 'whatsapp' || channel === 'twilio-sms') {
        const phoneResults = await prisma.$queryRawUnsafe(`
          SELECT * FROM conversations
          WHERE user_id = $1::uuid AND 
                primary_channel IN ('whatsapp', 'twilio-sms') AND
                unified_thread_id = $2
          LIMIT 1;
        `, userId, senderId);

        if (phoneResults && phoneResults.length > 0) {
          return phoneResults[0];
        }
      }
      
      return null;
    } catch (err) {
      console.error('⚠️ [ThreadSyncEngine] Search heuristic error:', err.message);
      return null;
    }
  }

  /**
   * Inserts a new conversation node into PostgreSQL
   */
  static async createConversation({ userId, unifiedThreadId, primaryChannel, participants }) {
    const convoId = crypto.randomUUID();
    const rows = await prisma.$queryRawUnsafe(`
      INSERT INTO conversations (id, user_id, unified_thread_id, primary_channel, participants, ai_summary, created_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6, $7, $8)
      RETURNING *;
    `,
      convoId,
      userId,
      unifiedThreadId,
      primaryChannel,
      JSON.stringify(participants),
      'Awaiting AI briefing...',
      new Date(),
      new Date()
    );

    return rows[0] || {
      id: convoId,
      user_id: userId,
      unified_thread_id: unifiedThreadId,
      primary_channel: primaryChannel,
      participants,
      ai_summary: 'Awaiting AI briefing...'
    };
  }

  /**
   * Updates an existing conversation node in PostgreSQL
   */
  static async updateConversation(id, { participants, aiSummary }) {
    const fieldsToSet = [];
    const values = [id];
    let paramIndex = 2;

    if (participants) {
      fieldsToSet.push(`participants = $${paramIndex}::jsonb`);
      values.push(JSON.stringify(participants));
      paramIndex++;
    }

    if (aiSummary) {
      fieldsToSet.push(`ai_summary = $${paramIndex}`);
      values.push(aiSummary);
      paramIndex++;
    }

    fieldsToSet.push(`updated_at = $${paramIndex}`);
    values.push(new Date());

    const query = `
      UPDATE conversations
      SET ${fieldsToSet.join(', ')}
      WHERE id = $1::uuid
      RETURNING *;
    `;

    const rows = await prisma.$queryRawUnsafe(query, ...values);
    return rows[0];
  }
}

module.exports = ThreadSyncEngine;
