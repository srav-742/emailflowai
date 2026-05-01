const prisma = require('../config/database');
const { extractTasksWithAI } = require('./taskExtractor');

/**
 * Extracts action items from an email and persists them to the ActionItem table.
 */
async function extractAndSaveActionItems(emailId, userId) {
  try {
    const email = await prisma.email.findFirst({
      where: { id: emailId, userId },
    });

    if (!email) throw new Error('Email not found');

    // 1. Use the existing AI extraction logic
    const tasks = await extractTasksWithAI(email);
    
    if (!tasks || !tasks.length) return [];

    // 2. Map and save to ActionItem table
    const actionItems = await Promise.all(
      tasks.map(async (task) => {
        // Try to parse due date if it exists
        let dueDate = null;
        if (task.deadline) {
          try {
            // Simple check: if it's already an ISO date, use it. 
            // Otherwise, let it be null or handle natural language if needed.
            const d = new Date(task.deadline);
            if (!isNaN(d.getTime())) dueDate = d;
          } catch (e) {
            // Ignore parse errors for natural language deadlines
          }
        }

        return prisma.actionItem.create({
          data: {
            userId,
            accountId: email.accountId,
            emailId: email.id,
            threadId: email.threadId,
            title: task.task,
            description: `Extracted from email: ${email.subject}`,
            assignee: task.assignee || 'me',
            dueDate,
            priority: task.priority || 'medium',
            status: 'pending',
          },
        });
      })
    );

    return actionItems;
  } catch (error) {
    console.error(`[ActionItemService] Extraction failed for email ${emailId}:`, error.message);
    throw error;
  }
}

/**
 * Batch extraction for multiple emails.
 */
async function extractBatchActionItems(emailIds = [], userId) {
  const results = [];
  for (const id of emailIds) {
    try {
      const items = await extractAndSaveActionItems(id, userId);
      results.push(...items);
    } catch (e) {
      console.error(`Batch item failed for ${id}:`, e.message);
    }
  }
  return results;
}

module.exports = {
  extractAndSaveActionItems,
  extractBatchActionItems,
};
