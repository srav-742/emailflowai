const express = require('express');
const {
  fetchEmails,
  getEmails,
  getEmailById,
  classifyEmails,
  summarizeEmail,
  getStats,
  syncEmails,
  aiSummarize,
  aiClassify,
  aiGenerateReply,
  sendReply,
  aiProcessAll,
} = require('../controllers/emailController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/fetch', fetchEmails);
router.get('/sync', syncEmails);
router.get('/', getEmails);
router.get('/stats', getStats);
router.post('/classify', classifyEmails);
router.get('/:id', getEmailById);
router.post('/:id/summarize', summarizeEmail);
router.post('/:id/reply/send', sendReply);

// AI-Powered Routes (Groq)
router.post('/ai/process-all', aiProcessAll);
router.post('/ai/:id/summarize', aiSummarize);
router.post('/ai/:id/classify', aiClassify);
router.post('/ai/:id/reply', aiGenerateReply);

module.exports = router;
