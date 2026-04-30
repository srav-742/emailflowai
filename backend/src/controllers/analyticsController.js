const analyticsService = require('../services/analyticsService');

const getSummary = async (req, res) => {
  try {
    const data = await analyticsService.getSummary(req.user.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
};

const getDailyStats = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const data = await analyticsService.getSummary(req.user.id); // Reusing summary which contains daily
    res.json(data.daily.slice(-Number(days)));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
};

const getTopSenders = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const data = await analyticsService.getTopSenders(req.user.id, Number(limit));
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch top senders' });
  }
};

const getCategoryBreakdown = async (req, res) => {
  try {
    const data = await analyticsService.getCategoryBreakdown(req.user.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category breakdown' });
  }
};

module.exports = {
  getSummary,
  getDailyStats,
  getTopSenders,
  getCategoryBreakdown
};
