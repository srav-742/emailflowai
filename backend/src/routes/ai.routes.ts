// src/routes/ai.routes.ts
import { Router } from 'express';
import {
  summarize,
  extractTasks,
  classify,
  generateDraft,
  morningBrief,
  trainStyle,
} from '../controllers/ai.controller';
import { authenticate } from '../middleware/auth.middleware';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticate);
router.use(aiLimiter);

router.get('/morning-brief', morningBrief);
router.post('/style/train', trainStyle);
router.get('/threads/:threadId/summarize', summarize);
router.get('/threads/:threadId/tasks', extractTasks);
router.get('/threads/:threadId/classify', classify);
router.post('/threads/:threadId/draft', generateDraft);

export default router;