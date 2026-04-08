// src/controllers/ai.controller.ts
import { Request, Response, NextFunction } from 'express';
import {
  summarizeThread,
  extractActionItems,
  classifyPriority,
  draftReply,
  generateMorningBrief,
  learnUserStyle,
  checkQuota,
} from '../services/ai.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';

// ── Quota check helper ─────────────────────────────────────────────────────
async function ensureQuota(userId: string, res: Response): Promise<boolean> {
  const ok = await checkQuota(userId);
  if (!ok) {
    sendError(res, 'Monthly AI action limit reached. Upgrade to Pro for unlimited access.', 402);
    return false;
  }
  return true;
}

// ── Summarize thread ──────────────────────────────────────────────────────
export const summarize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    if (!(await ensureQuota(userId, res))) return;

    const { threadId } = req.params;
    const summary = await summarizeThread(userId, threadId);
    sendSuccess(res, { summary });
  } catch (err) {
    next(err);
  }
};

// ── Extract action items ──────────────────────────────────────────────────
export const extractTasks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    if (!(await ensureQuota(userId, res))) return;

    const { threadId } = req.params;
    const actionItems = await extractActionItems(userId, threadId);
    sendSuccess(res, { actionItems });
  } catch (err) {
    next(err);
  }
};

// ── Classify priority ─────────────────────────────────────────────────────
export const classify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    if (!(await ensureQuota(userId, res))) return;

    const { threadId } = req.params;
    const priority = await classifyPriority(userId, threadId);
    sendSuccess(res, { priority });
  } catch (err) {
    next(err);
  }
};

// ── Draft reply ───────────────────────────────────────────────────────────
export const generateDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    if (!(await ensureQuota(userId, res))) return;

    const { threadId } = req.params;
    const { instruction } = req.body;
    const draft = await draftReply(userId, threadId, instruction);
    sendSuccess(res, { draft });
  } catch (err) {
    next(err);
  }
};

// ── Morning brief ─────────────────────────────────────────────────────────
export const morningBrief = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const brief = await generateMorningBrief(userId);
    sendSuccess(res, { brief });
  } catch (err) {
    next(err);
  }
};

// ── Trigger style learning ────────────────────────────────────────────────
export const trainStyle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    if (!(await ensureQuota(userId, res))) return;

    await learnUserStyle(userId);
    sendSuccess(res, null, 'Style profile updated successfully');
  } catch (err) {
    next(err);
  }
};