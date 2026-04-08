// src/routes/email.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import {
  syncUserEmails,
  getEmailThreads,
  getThread,
  archiveThread,
  sendReply,
  createFollowUp,
  getInboxStats,
} from '../controllers/email.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validateRequest';

const router = Router();

router.use(authenticate);

router.get('/stats', getInboxStats);
router.post('/sync', syncUserEmails);
router.get('/threads', getEmailThreads);
router.get('/threads/:threadId', getThread);
router.patch('/threads/:threadId/archive', archiveThread);

router.post(
  '/threads/:threadId/reply',
  [body('body').notEmpty().withMessage('Reply body is required')],
  validateRequest,
  sendReply
);

router.post(
  '/threads/:threadId/followup',
  [body('dueAt').isISO8601().withMessage('Valid date required')],
  validateRequest,
  createFollowUp
);

export default router;