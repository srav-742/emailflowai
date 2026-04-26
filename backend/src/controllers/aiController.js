const prisma = require('../config/database');
const { getMorningBrief } = require('../services/briefService');
const { learnUserStyle } = require('../services/styleService');
const { getAnalytics } = require('../services/analyticsService');
const { summarizeBatchEmails } = require('../utils/xai');

const morningBrief = async (req, res) => {
  try {
    const brief = await getMorningBrief(req.user.id);
    res.json({ brief });
  } catch (error) {
    console.error('Morning brief error:', error);
    res.status(500).json({ error: 'Failed to build morning brief' });
  }
};

const trainStyle = async (req, res) => {
  try {
    const result = await learnUserStyle(req.user.id);
    res.json({
      message: result.message,
      ready: result.ready,
      style: result.style,
      sampleCount: result.sampleCount,
    });
  } catch (error) {
    console.error('Style training error:', error);
    res.status(500).json({ error: 'Failed to learn writing style' });
  }
};

const getAnalyticsSummary = async (req, res) => {
  try {
    const stats = await getAnalytics(req.user.id);
    res.json({ stats });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
};

const getInboxSummary = async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 35, 50);
    const emails = await prisma.email.findMany({
      where:   { userId: req.user.id },
      orderBy: { receivedAt: 'desc' },
      take:    limit,
    });

    if (!emails.length) {
      return res.json({
        executive_summary: 'No emails found. Sync your inbox to see AI analysis.',
        key_updates: [],
        action_items: [],
        risks: [],
        insights: [],
        priority: 'low'
      });
    }

    const result = await summarizeBatchEmails(emails, req.user.id);

    return res.json({
      ...result,
      emailCount: emails.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Inbox summary error:', error);
    return res.status(500).json({ error: 'Failed to generate inbox summary' });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const { importantContacts, name } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        importantContacts: Array.isArray(importantContacts) ? importantContacts : undefined,
        name: name || undefined,
      }
    });
    res.json({ message: 'Preferences updated', user });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

const listAccounts = async (req, res) => {
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        email: true,
        provider: true,
        lastSyncAt: true,
        createdAt: true,
      }
    });
    res.json({ accounts });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ error: 'Failed to list connected accounts' });
  }
};

module.exports = {
  morningBrief,
  trainStyle,
  getAnalyticsSummary,
  getInboxSummary,
  updatePreferences,
  listAccounts,
};
