const prisma = require('../config/database');
const digestService = require('../services/digestService');

const getTodayDigest = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let digest = await prisma.dailyDigest.findUnique({
      where: {
        userId_digestDate: {
          userId: req.user.id,
          digestDate: today
        }
      }
    });

    // If no digest exists today, try to generate one on the fly
    if (!digest) {
      digest = await digestService.generateDailyDigest(req.user.id);
    }

    res.json(digest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPreferences = async (req, res) => {
  try {
    const prefs = await prisma.digestPreference.upsert({
      where: { userId: req.user.id },
      update: {},
      create: { userId: req.user.id }
    });
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const prefs = await prisma.digestPreference.update({
      where: { userId: req.user.id },
      data: req.body
    });
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const triggerManualGeneration = async (req, res) => {
  try {
    const digest = await digestService.generateDailyDigest(req.user.id);
    res.json(digest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getTodayDigest,
  getPreferences,
  updatePreferences,
  triggerManualGeneration,
};
