const axios = require('axios');
const prisma = require('../config/database');

/**
 * Analyzes sent emails to build or update a user's writing style profile.
 */
async function buildStyleProfile(userId) {
  try {
    console.log(`[StyleService] Analyzing style for user ${userId}...`);

    // 1. Fetch the last 50 sent emails
    const sentEmails = await prisma.email.findMany({
      where: { 
        userId,
        gmailLabelIds: { has: 'SENT' } 
      },
      orderBy: { receivedAt: 'desc' },
      take: 50,
      select: { subject: true, body: true, snippet: true }
    });

    if (sentEmails.length < 5) {
      console.warn(`[StyleService] Not enough sent emails (${sentEmails.length}) to build a profile for user ${userId}.`);
      return null;
    }

    const emailTexts = sentEmails
      .map(e => `Subject: ${e.subject}\nContent: ${e.body || e.snippet}`)
      .join('\n\n---\n\n');

    // 2. Analyze with AI (Groq)
    const prompt = `
      Analyze the following email samples and extract the author's writing style.
      
      Return a JSON object with:
      - tone: (string) overall tone like "formal", "casual", "direct", or "friendly"
      - formality_score: (number 1-10) 1 is very casual, 10 is strictly professional
      - avg_sentence_length: (number) average words per sentence
      - common_openers: (array of strings) common ways they start emails
      - common_closers: (array of strings) common ways they end emails
      - punctuation_style: (string) e.g., "minimal", "standard", "enthusiastic"
      - vocabulary_level: (string) e.g., "simple", "professional", "academic"
      - sign_off_name: (string) how they usually sign their name

      SAMPLES:
      ${emailTexts}
    `;

    const response = await axios.post(process.env.GROQ_API_URL, {
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a linguistic analyst. Return ONLY a valid JSON object.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });

    const profileData = JSON.parse(response.data.choices[0].message.content);

    // 3. Save to database
    const profile = await prisma.styleProfile.upsert({
      where: { userId },
      update: {
        tone: profileData.tone,
        formalityScore: profileData.formality_score,
        avgSentenceLength: profileData.avg_sentence_length,
        commonOpeners: profileData.common_openers,
        commonClosers: profileData.common_closers,
        punctuationStyle: profileData.punctuation_style,
        vocabularyLevel: profileData.vocabulary_level,
        rawProfile: profileData,
        lastLearnedAt: new Date(),
      },
      create: {
        userId,
        tone: profileData.tone,
        formalityScore: profileData.formality_score,
        avgSentenceLength: profileData.avg_sentence_length,
        commonOpeners: profileData.common_openers,
        commonClosers: profileData.common_closers,
        punctuationStyle: profileData.punctuation_style,
        vocabularyLevel: profileData.vocabulary_level,
        rawProfile: profileData,
        lastLearnedAt: new Date(),
      }
    });

    console.log(`[StyleService] Successfully updated style profile for user ${userId}. Tone: ${profile.tone}`);
    return profile;
  } catch (error) {
    console.error(`[StyleService] Error building profile for user ${userId}:`, error.message);
    return null;
  }
}

/**
 * Returns the formatting instructions for the AI based on the user's style profile.
 */
async function getStyleInstructions(userId) {
  const profile = await prisma.styleProfile.findUnique({ where: { userId } });
  if (!profile) return 'Maintain a professional and clear tone.';

  return `
    Draft the email in the user's personal style:
    - Tone: ${profile.tone}
    - Formality (1-10): ${profile.formalityScore}
    - Common Openers: ${profile.commonOpeners.join(', ')}
    - Common Closers: ${profile.commonClosers.join(', ')}
    - Vocabulary Level: ${profile.vocabularyLevel}
    - Punctuation Style: ${profile.punctuationStyle}
  `;
}

/**
 * Gets the user's style profile, or creates it if it doesn't exist.
 */
async function getOrCreateStyleProfile(userId) {
  let profile = await prisma.styleProfile.findUnique({ where: { userId } });
  if (!profile) {
    profile = await buildStyleProfile(userId);
  } else {
    // Check if it needs a refresh
    await refreshStyleProfileIfReady(userId, profile);
  }
  return profile;
}

/**
 * Refreshes the style profile if it's in the learning period (daily) 
 * or maintenance period (weekly).
 */
async function refreshStyleProfileIfReady(userId, profile) {
  const now = new Date();
  const lastLearnedAt = new Date(profile.lastLearnedAt);
  const diffInDays = (now - lastLearnedAt) / (1000 * 60 * 60 * 24);

  // Check user signup date to determine if in 10-day learning mode
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  const signupDate = new Date(user.createdAt);
  const daysSinceSignup = (now - signupDate) / (1000 * 60 * 60 * 24);

  let shouldRefresh = false;

  if (daysSinceSignup <= 10) {
    // 10-day intensive mode: refresh daily
    if (diffInDays >= 1) shouldRefresh = true;
  } else {
    // Maintenance mode: refresh weekly
    if (diffInDays >= 7) shouldRefresh = true;
  }

  if (shouldRefresh) {
    console.log(`[StyleService] Refreshing profile for user ${userId} (${daysSinceSignup <= 10 ? 'Learning Mode' : 'Maintenance Mode'})`);
    return await buildStyleProfile(userId);
  }

  return profile;
}

module.exports = { 
  buildStyleProfile, 
  getStyleInstructions, 
  getOrCreateStyleProfile, 
  refreshStyleProfileIfReady 
};
