/**
 * Universal Message Normalization Engine
 * Normalizes all communication channel payloads into the EmailFlow standard.
 */

class MessageNormalizer {
  /**
   * Normalizes any input payload based on its channel type
   */
  static normalize(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('[Normalizer] Invalid message payload: Must be an object.');
    }

    const channelType = String(payload.channel || payload.channel_type || 'email').toLowerCase();

    switch (channelType) {
      case 'slack':
        return this.normalizeSlack(payload);
      case 'twilio-sms':
      case 'sms':
        return this.normalizeSMS(payload);
      case 'whatsapp':
        return this.normalizeWhatsApp(payload);
      case 'teams':
        return this.normalizeTeams(payload);
      case 'telegram':
        return this.normalizeTelegram(payload);
      case 'push':
        return this.normalizePush(payload);
      case 'email':
      default:
        return this.normalizeEmail(payload);
    }
  }

  /**
   * Normalizes Slack events into standard schema
   */
  static normalizeSlack(payload) {
    // Handle standard webhook / post body or event subscriptions
    const text = payload.text || payload.content?.text || (payload.event ? payload.event.text : '') || '';
    const senderId = payload.user || payload.sender?.id || (payload.event ? payload.event.user : 'U_UNKNOWN');
    const senderName = payload.sender_name || payload.sender?.name || `Slack User ${senderId.slice(-4)}`;
    const threadId = payload.thread || payload.thread_id || payload.thread_ts || (payload.event ? payload.event.thread_ts : '') || payload.ts || '';
    const recipientId = payload.recipient?.id || payload.channel_id || (payload.event ? payload.event.channel : 'C_CHANNEL');

    return {
      channel: 'slack',
      sender: {
        id: senderId,
        name: senderName,
        avatar: payload.sender?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${senderId}`
      },
      recipient: {
        id: recipientId,
        name: payload.recipient?.name || 'Slack Workspace'
      },
      content: {
        text: text,
        html: payload.content?.html || `<p>${text}</p>`
      },
      attachments: payload.attachments || [],
      thread_id: threadId,
      metadata: {
        event_ts: payload.ts || (payload.event ? payload.event.ts : ''),
        team_id: payload.team_id || '',
        ...payload.metadata
      }
    };
  }

  /**
   * Normalizes Twilio SMS payloads into standard schema
   */
  static normalizeSMS(payload) {
    // Support standard Twilio webhook properties: From, To, Body, MessageSid
    const text = payload.Body || payload.text || payload.content?.text || '';
    const fromNumber = payload.From || payload.sender?.id || 'Unknown SMS';
    const toNumber = payload.To || payload.recipient?.id || 'EmailFlow SMS Number';
    const externalId = payload.MessageSid || payload.external_message_id || '';

    return {
      channel: 'twilio-sms',
      sender: {
        id: fromNumber,
        name: payload.sender?.name || fromNumber,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${fromNumber}`
      },
      recipient: {
        id: toNumber,
        name: 'EmailFlow System'
      },
      content: {
        text: text,
        html: `<p>${text}</p>`
      },
      attachments: payload.MediaUrl0 ? [payload.MediaUrl0] : [],
      thread_id: payload.thread_id || fromNumber, // Correlate on sender's number
      metadata: {
        sms_sid: externalId,
        sms_status: payload.SmsStatus || 'received',
        ...payload.metadata
      }
    };
  }

  /**
   * Normalizes WhatsApp payloads into standard schema
   */
  static normalizeWhatsApp(payload) {
    // WhatsApp often uses Twilio body or direct whatsapp numbers
    const text = payload.Body || payload.text || payload.content?.text || '';
    const rawFrom = payload.From || payload.sender?.id || 'whatsapp:+12345';
    const rawTo = payload.To || payload.recipient?.id || 'whatsapp:+54321';
    
    const cleanFrom = rawFrom.replace('whatsapp:', '');
    const cleanTo = rawTo.replace('whatsapp:', '');

    return {
      channel: 'whatsapp',
      sender: {
        id: cleanFrom,
        name: payload.sender?.name || cleanFrom,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanFrom}`
      },
      recipient: {
        id: cleanTo,
        name: 'EmailFlow Business WhatsApp'
      },
      content: {
        text: text,
        html: `<p>${text}</p>`
      },
      attachments: payload.MediaUrl0 ? [payload.MediaUrl0] : [],
      thread_id: payload.thread_id || cleanFrom, // WhatsApp correlates by user phone
      metadata: {
        whatsapp_sid: payload.MessageSid || '',
        ...payload.metadata
      }
    };
  }

  /**
   * Normalizes Microsoft Teams payloads into standard schema
   */
  static normalizeTeams(payload) {
    const text = payload.text || payload.content?.text || 'Empty Teams Message';
    const senderId = payload.sender?.id || 'teams-sender';
    
    return {
      channel: 'teams',
      sender: {
        id: senderId,
        name: payload.sender?.name || 'Teams Colleague',
        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${senderId}`
      },
      recipient: {
        id: payload.recipient?.id || 'teams-channel',
        name: 'Teams Channel'
      },
      content: {
        text: text,
        html: payload.content?.html || `<p>${text}</p>`
      },
      attachments: payload.attachments || [],
      thread_id: payload.thread_id || 'teams-thread-default',
      metadata: payload.metadata || {}
    };
  }

  /**
   * Normalizes Telegram Bot payloads into standard schema
   */
  static normalizeTelegram(payload) {
    // Telegram Bot API formats chat / message events
    const message = payload.message || payload;
    const text = message.text || payload.text || '';
    const fromUser = message.from || payload.sender || {};
    const senderId = String(fromUser.id || 'telegram-user');
    const senderName = fromUser.username || `${fromUser.first_name || 'Telegram'} ${fromUser.last_name || 'User'}`;
    const chatId = String(message.chat?.id || payload.thread_id || 'telegram-chat');

    return {
      channel: 'telegram',
      sender: {
        id: senderId,
        name: senderName,
        avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${senderName}`
      },
      recipient: {
        id: chatId,
        name: 'Executive Bot'
      },
      content: {
        text: text,
        html: `<p>${text}</p>`
      },
      attachments: [],
      thread_id: chatId, // Telegram matches threads by Chat ID
      metadata: {
        message_id: message.message_id || '',
        chat_type: message.chat?.type || 'private',
        ...payload.metadata
      }
    };
  }

  /**
   * Normalizes Mobile/Web Push payloads into standard schema
   */
  static normalizePush(payload) {
    const text = payload.text || payload.body || '';
    const senderId = payload.sender?.id || 'system-alert';

    return {
      channel: 'push',
      sender: {
        id: senderId,
        name: payload.sender?.name || 'System Broadcast',
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=system`
      },
      recipient: {
        id: payload.recipient?.id || 'web-browser',
        name: 'User Client'
      },
      content: {
        text: text,
        html: `<p>${text}</p>`
      },
      attachments: [],
      thread_id: payload.thread_id || 'push-broadcast',
      metadata: payload.metadata || {}
    };
  }

  /**
   * Normalizes standard email payloads into standard schema for compatibility
   */
  static normalizeEmail(payload) {
    return {
      channel: 'email',
      sender: {
        id: payload.sender || payload.from || 'unknown@emailflow.com',
        name: payload.sender_name || payload.from_name || 'Unknown Email Sender',
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${payload.sender || 'unknown'}`
      },
      recipient: {
        id: payload.recipient || payload.to || 'user@emailflow.com',
        name: 'Me'
      },
      content: {
        text: payload.body || payload.snippet || payload.subject || '',
        html: payload.html || `<p>${payload.body || ''}</p>`
      },
      attachments: payload.attachments || [],
      thread_id: payload.thread_id || payload.threadId || 'email-thread',
      metadata: payload.metadata || {}
    };
  }
}

module.exports = MessageNormalizer;
