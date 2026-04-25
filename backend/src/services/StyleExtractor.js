const prisma = require('../config/database');
const { analyzeWritingStyle } = require('../utils/xai');

/**
 * StyleExtractor
 * 
 * Performs deep analysis of user writing patterns.
 * Looks at sentence length, vocabulary complexity, common greeting/closings,
 * and how the user corrects AI drafts.
 */
class StyleExtractor {
  static getTrainingDelegate() {
    return prisma.aiTraining || prisma.aITraining || null;
  }

  static async getEditedDraftSamples(userId) {
    const trainingDelegate = StyleExtractor.getTrainingDelegate();

    if (!trainingDelegate?.findMany) {
      return [];
    }

    try {
      return await trainingDelegate.findMany({
        where: { userId },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });
    } catch (error) {
      console.warn('[StyleExtractor] AI training history unavailable, falling back to sent emails only.');
      return [];
    }
  }

  static async extractProfile(userId) {
    const [sentEmails, editedDrafts] = await Promise.all([
      prisma.email.findMany({
        where: { userId, isSent: true },
        take: 15,
        orderBy: { receivedAt: 'desc' },
        select: { body: true, subject: true }
      }),
      StyleExtractor.getEditedDraftSamples(userId)
    ]);

    if (sentEmails.length < 5 && editedDrafts.length < 3) {
      return { ready: false, reason: 'insufficient_data' };
    }

    const samples = [
      ...sentEmails.map(e => `[SENT_EMAIL] ${e.subject}\n${e.body}`),
      ...editedDrafts.map(d => `[AI_DRAFT_CORRECTION] Original: ${d.originalText}\nEdited: ${d.editedText}`)
    ];

    console.log(`[StyleExtractor] Analyzing ${samples.length} samples for user ${userId}`);
    
    // Call XAI utility for linguistic extraction
    const profile = await analyzeWritingStyle(samples);

    return {
      ...profile,
      ready: true,
      lastExtraction: new Date().toISOString(),
      sampleSize: samples.length
    };
  }

  static async logDraftEdit(userId, emailId, originalText, editedText, tone) {
    if (originalText === editedText) return null;

    const trainingDelegate = StyleExtractor.getTrainingDelegate();

    if (!trainingDelegate?.create) {
      return null;
    }

    try {
      return await trainingDelegate.create({
        data: {
          userId,
          emailId,
          originalText,
          editedText,
          tone
        }
      });
    } catch (error) {
      console.warn('[StyleExtractor] Draft edit could not be stored.');
      return null;
    }
  }
}

module.exports = StyleExtractor;
