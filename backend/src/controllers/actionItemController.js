const prisma = require('../config/database');
const { extractAndSaveActionItems, extractBatchActionItems } = require('../services/actionItemService');

const getActionItems = async (req, res) => {
  try {
    const { status = 'pending', priority, page = 1, limit = 50 } = req.query;
    
    const where = {
      userId: req.user.id,
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
    };

    const items = await prisma.actionItem.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { extractedAt: 'desc' },
      ],
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        email: {
          select: { subject: true, sender: true }
        }
      }
    });

    const total = await prisma.actionItem.count({ where });

    res.json({
      items,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      }
    });
  } catch (error) {
    console.error('Get action items error:', error);
    res.status(500).json({ error: 'Failed to fetch action items' });
  }
};

const extractFromEmail = async (req, res) => {
  try {
    const { emailId } = req.params;
    const items = await extractAndSaveActionItems(emailId, req.user.id);
    res.json({ message: `Extracted ${items.length} action items`, items });
  } catch (error) {
    console.error('Extract items error:', error);
    res.status(500).json({ error: error.message || 'Failed to extract action items' });
  }
};

const extractBatch = async (req, res) => {
  try {
    const { emailIds } = req.body;
    if (!Array.isArray(emailIds)) return res.status(400).json({ error: 'emailIds array is required' });
    
    const items = await extractBatchActionItems(emailIds, req.user.id);
    res.json({ message: `Batch extraction complete. Created ${items.length} items.`, items });
  } catch (error) {
    console.error('Batch extract error:', error);
    res.status(500).json({ error: 'Failed to extract batch items' });
  }
};

const updateActionItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, dueDate, priority, title } = req.body;
    
    const data = {};
    if (status) {
      data.status = status;
      if (status === 'done') data.completedAt = new Date();
    }
    if (dueDate) data.dueDate = new Date(dueDate);
    if (priority) data.priority = priority;
    if (title) data.title = title;

    const updated = await prisma.actionItem.update({
      where: { id, userId: req.user.id },
      data,
    });

    res.json({ message: 'Action item updated', item: updated });
  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({ error: 'Failed to update action item' });
  }
};

const deleteActionItem = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.actionItem.delete({
      where: { id, userId: req.user.id },
    });
    res.json({ message: 'Action item deleted' });
  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({ error: 'Failed to delete action item' });
  }
};

module.exports = {
  getActionItems,
  extractFromEmail,
  extractBatch,
  updateActionItem,
  deleteActionItem,
};
