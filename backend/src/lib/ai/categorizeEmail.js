const { requestGroq, extractJsonBlock } = require('../../utils/xai');

/**
 * Categorizes an email into one of the four smart tabs.
 * @param {Object} emailData { from, subject, snippet, body }
 * @returns {Promise<{category: string, confidence: number}>}
 */
async function categorizeEmail(emailData) {
  const { from, subject, snippet, body } = emailData;
  
  const text = (subject + ' ' + (snippet || '') + ' ' + (body || '')).toLowerCase();
  
  // Rule-based check for newsletter (fast)
  if (text.includes('unsubscribe') || text.includes('view in browser') || text.includes('mailing list')) {
    return { category: 'newsletter', confidence: 1.0 };
  }

  const prompt = `
    Classify this email into one of the following categories:
    1. focus_today: Urgent, needs attention now, requires a reply or action within 24h.
    2. read_later: Informational, non-urgent, news, reports, or articles that can be read later.
    3. newsletter: Bulk marketing, subscriptions, promotions.
    4. other: Anything else that doesn't fit the above.

    Return ONLY a JSON object: {"category": "focus_today" | "read_later" | "newsletter" | "other", "confidence": float}
    
    Email Details:
    From: ${from}
    Subject: ${subject}
    Snippet: ${snippet}
  `;

  try {
    const response = await requestGroq([
      { role: 'system', content: 'You are a high-precision email categorization assistant.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.1 });

    const json = extractJsonBlock(response, 'object');
    if (json) {
      const parsed = JSON.parse(json);
      
      // If confidence is low, we might want to default or use more rules
      if (parsed.confidence < 0.7) {
        // Additional rule-based logic could go here
        if (text.includes('order') || text.includes('receipt') || text.includes('confirmation')) {
            return { category: 'read_later', confidence: 0.8 };
        }
      }

      return {
        category: parsed.category || 'other',
        confidence: parsed.confidence || 0.5
      };
    }
  } catch (error) {
    console.error('[AI Categorizer] Error:', error);
  }

/**
 * Categorizes a batch of emails for better efficiency.
 * @param {Array} emailsData Array of { id, from, subject, snippet }
 * @returns {Promise<Array>} Array of { id, category, confidence }
 */
async function categorizeEmailsBatch(emailsData) {
  if (!emailsData.length) return [];

  const emailList = emailsData.map((e, i) => 
    `ID: ${i}\nFrom: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`
  ).join('\n---\n');

  const prompt = `
    Classify each of the following emails into one of these categories:
    1. focus_today: Urgent, needs attention now, requires a reply or action within 24h.
    2. read_later: Informational, non-urgent, news, reports, or articles that can be read later.
    3. newsletter: Bulk marketing, subscriptions, promotions.
    4. other: Anything else.

    Return ONLY a JSON array of objects, one for each email in order:
    [{"category": "...", "confidence": float}, ...]
    
    Emails:
    ${emailList}
  `;

  try {
    const response = await requestGroq([
      { role: 'system', content: 'You are a high-precision email categorization assistant. Return only JSON.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.1 });

    const json = extractJsonBlock(response, 'array');
    if (json) {
      const results = JSON.parse(json);
      return emailsData.map((data, i) => {
        const result = results[i] || { category: 'other', confidence: 0 };
        
        // Rule-based override for newsletter
        const text = (data.subject + ' ' + (data.snippet || '')).toLowerCase();
        if (text.includes('unsubscribe') || text.includes('view in browser')) {
          return { ...result, category: 'newsletter', confidence: 1.0 };
        }

        return result;
      });
    }
  } catch (error) {
    console.error('[AI Categorizer] Batch Error:', error);
  }

  return emailsData.map(() => ({ category: 'other', confidence: 0 }));
}

module.exports = { categorizeEmail, categorizeEmailsBatch };
