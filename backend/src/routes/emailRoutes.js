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
  getAttachmentDownloadUrl,
  summarizeThread,
} = require('../controllers/emailController');
const { authenticate } = require('../middleware/auth');
const planGating = require('../middleware/planGating');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

router.get('/fetch', asyncHandler(fetchEmails));
router.get('/sync', asyncHandler(syncEmails));
router.get('/search', asyncHandler(searchEmails));
router.get('/', asyncHandler(getEmails));
router.get('/threads', asyncHandler(getThreads));
router.get('/threads/:threadId', asyncHandler(getThreadById));
router.post('/threads/:threadId/summarize', asyncHandler(summarizeThread));
router.get('/stats', asyncHandler(getStats));
router.get('/counts', asyncHandler(getCategoryCounts));
router.post('/classify', asyncHandler(classifyEmails));
router.get('/:id', asyncHandler(getEmailById));
router.patch('/:id/category', asyncHandler(updateEmailCategory));
router.post('/:id/summarize', asyncHandler(summarizeEmail));
router.post('/:id/extract-tasks', asyncHandler(extractEmailTasks));
router.post('/:id/reply/send', asyncHandler(sendReply));
router.get('/attachments/:id/download', asyncHandler(getAttachmentDownloadUrl));

// AI-Powered Routes (Groq) - Gated by Plan
router.post('/ai/process-all', planGating(['free', 'pro']), asyncHandler(aiProcessAll));
router.post('/ai/:id/summarize', planGating(['pro']), asyncHandler(aiSummarize));
router.post('/ai/:id/classify', planGating(['pro']), asyncHandler(aiClassify));
router.post('/ai/:id/reply', planGating(['pro']), asyncHandler(aiGenerateReply));

module.exports = router;
