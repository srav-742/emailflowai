const followUpService = require('../services/followUpService');
const prisma = require('../config/database');

const getFollowUps = async (req, res) => {
  try {
    const followUps = await followUpService.getActiveFollowUps(req.user.id);
    res.json({ items: followUps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const snooze = async (req, res) => {
  try {
    const { days } = req.body;
    await followUpService.snoozeFollowUp(req.params.id, req.user.id, days || 2);
    res.json({ message: 'Follow-up snoozed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const dismiss = async (req, res) => {
  try {
    await followUpService.dismissFollowUp(req.params.id, req.user.id);
    res.json({ message: 'Follow-up dismissed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getStats = async (req, res) => {
  try {
    const counts = await prisma.followUp.groupBy({
      by: ['status'],
      where: { userId: req.user.id },
      _count: true,
    });
    
    const stats = counts.reduce((acc, curr) => {
      acc[curr.status] = curr._count;
      return acc;
    }, {});

    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getFollowUps,
  snooze,
  dismiss,
  getStats,
};
