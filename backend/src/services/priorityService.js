const axios = require('axios');
const prisma = require('../config/database');

/**
 * Scores an email's priority (0.0 - 1.0) and provides a 1-line reason.
 */
async function scoreEmailPriority(emailId) {
  try {
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      select: { id: true, subject: true, sender: true, senderName: true, body: true, snippet: true, userId: true }
    });

    if (!email) return null;

    const content = `From: ${email.senderName || email.sender}\nSubject: ${email.subject}\n\n${(email.body || email.snippet).slice(0, 800)}`;

    const prompt = `
      Score this email's priority from 0.0 to 1.0 and give a 1-line reason.
      
      High priority (0.7-1.0): Deadlines, financial, legal, direct questions to user, action required today.
      Medium priority (0.4-0.6): General business, updates on ongoing projects, meetings.
      Low priority (0.0-0.3): Newsletters, marketing, automated notifications, cold reachouts.

      Return ONLY a JSON object: {"score": 0.85, "reason": "Short 1-line explanation"}
      
      EMAIL:
      ${content}
    `;

    const response = await axios.post(process.env.GROQ_API_URL, {
      model: 'llama-3.1-8b-instant', // Fast and cheap for scoring
      messages: [
        { role: 'system', content: 'You are an email priority analyzer. Return ONLY JSON.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });

    const result = JSON.parse(response.data.choices[0].message.content);

    const updatedEmail = await prisma.email.update({
      where: { id: emailId },
      data: {
        priorityScore: result.score || 0.5,
        priorityReason: result.reason || 'No specific priority signal detected.',
        priorityScoredAt: new Date()
      }
    });

    console.log(`[PriorityService] Scored email ${emailId}: ${result.score} (${result.reason})`);
    return updatedEmail;
  } catch (error) {
    console.error(`[PriorityService] Error scoring email ${emailId}:`, error.message);
    return null;
  }
}

module.exports = { scoreEmailPriority };
