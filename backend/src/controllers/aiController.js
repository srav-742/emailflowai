const prisma = require('../config/database');
const { getMorningBrief } = require('../services/briefService');
const { learnUserStyle } = require('../services/styleService');
const { getAnalytics } = require('../services/analyticsService');
const { summarizeBatchEmails } = require('../utils/xai');

function normalizeImportantContacts(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((item) => item.trim());

  return [...new Set(items.filter(Boolean))];
}

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
      minSamples: result.minSamples,
      remainingSamples: result.remainingSamples,
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

const updatePreferences = async (req, res) => {
  try {
    const importantContacts = normalizeImportantContacts(req.body.importantContacts);

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { importantContacts },
      select: {
        id: true,
        importantContacts: true,
        style: true,
        plan: true,
      },
    });

    res.json({
      message: 'Preferences updated',
      user,
    });
  } catch (error) {
    console.error('Preferences update error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
};

const listAccounts = async (req, res) => {
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { emails: true },
        },
      },
    });

    res.json({ accounts });
  } catch (error) {
    console.error('List accounts error:', error);
    res.status(500).json({ error: 'Failed to load connected accounts' });
  }
};

const getInboxSummary = async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 20, 50);
    const emails = await prisma.email.findMany({
      where:   { userId: req.user.id },
      orderBy: { receivedAt: 'desc' },
      take:    limit,
      select: {
        id:         true,
        subject:    true,
        sender:     true,
        senderName: true,
        snippet:    true,
        summary:    true,
        category:   true,
        priority:   true,
        receivedAt: true,
      },
    });

    if (!emails.length) {
      return res.json({
        summary:     'No emails found. Sync your Gmail inbox to start seeing AI analysis here.',
        emailCount:  0,
        generatedAt: new Date().toISOString(),
        emails:      [],
      });
    }

    const summaryText = await summarizeBatchEmails(emails);

    return res.json({
      summary:     summaryText,
      emailCount:  emails.length,
      generatedAt: new Date().toISOString(),
      emails:      emails.map((e) => ({
        id:       e.id,
        subject:  e.subject  || 'No Subject',
        sender:   e.senderName || e.sender || 'Unknown',
        category: e.category || 'general',
        priority: e.priority || 'normal',
        snippet:  e.summary  || e.snippet || '',
      })),
    });
  } catch (error) {
    console.error('Inbox summary error:', error);
    return res.status(500).json({ error: 'Failed to generate inbox summary' });
  }
};

module.exports = {
  morningBrief,
  trainStyle,
  getAnalyticsSummary,
  updatePreferences,
  listAccounts,
  getInboxSummary,
};
