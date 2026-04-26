const express = require('express');
const {
  fetchEmails,
  getEmails,
  getEmailById,
  classifyEmails,
  summarizeEmail,
  getStats,
  syncEmails,
  extractEmailTasks,
  aiSummarize,
  aiClassify,
  aiGenerateReply,
  sendReply,
  aiProcessAll,
  getThreads,
  getThreadById,
  searchEmails,
  getCategoryCounts,
  updateEmailCategory,
} = require('../controllers/emailController');
const { authenticate } = require('../middleware/auth');
const planGating = require('../middleware/planGating');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/fetch', fetchEmails);
router.get('/sync', syncEmails);
router.get('/search', searchEmails);
router.get('/', getEmails);
router.get('/threads', getThreads);
router.get('/threads/:threadId', getThreadById);
router.get('/stats', getStats);
router.get('/counts', getCategoryCounts);
router.post('/classify', classifyEmails);
router.get('/:id', getEmailById);
router.patch('/:id/category', updateEmailCategory);
router.post('/:id/summarize', summarizeEmail);
router.post('/:id/extract-tasks', extractEmailTasks);
router.post('/:id/reply/send', sendReply);

// AI-Powered Routes (Groq) - Gated by Plan (Relaxed for now to avoid 403)
router.post('/ai/process-all', planGating(['pro', 'basic', 'free']), aiProcessAll);
router.post('/ai/:id/summarize', planGating(['pro']), aiSummarize);
router.post('/ai/:id/classify', planGating(['pro', 'basic']), aiClassify);
router.post('/ai/:id/reply', planGating(['pro']), aiGenerateReply);

module.exports = router;
