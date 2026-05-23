/**
 * Stage 4: Omnichannel Integration Service
 * Isolated module to prevent modifying existing codes.
 */
class OmnichannelService {
  /**
   * Mocks connecting to a third-party messaging platform
   */
  static async syncPlatform(platformName, userId) {
    console.log(`[Stage 4] Syncing Omnichannel platform: ${platformName} for user: ${userId}`);
    
    // Simulate API fetch
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return {
      platform: platformName,
      status: 'connected',
      recentMessages: [
        {
          id: `msg_${Math.random().toString(36).substring(7)}`,
          sender: 'Sarah (Engineering)',
          content: 'Hey, did you review the latest PR for the API gateway?',
          timestamp: new Date().toISOString(),
          requiresAction: true
        }
      ]
    };
  }

  /**
   * Normalizes an external message into the EmailFlow standard Memory Graph format
   */
  static normalizeToGraph(message, platform) {
    return {
      entity: message.sender,
      relationship: `Colleague on ${platform}`,
      context: message.content,
      weight: message.requiresAction ? 0.8 : 0.3
    };
  }
}

module.exports = OmnichannelService;
