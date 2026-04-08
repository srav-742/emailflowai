// src/controllers/email.controller.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { syncEmails, getThreads, sendEmail } from '../services/email.service';
import { sendSuccess, sendError, sendPaginated } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';
import { EmailCategory, Priority } from '@prisma/client';

// ── Sync emails for the authenticated user ─────────────────────────────────
export const syncUserEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const account = await prisma.emailAccount.findFirst({
      where: { userId, isActive: true },
    });
    if (!account) throw new AppError('No connected email account found', 404);

    const synced = await syncEmails(userId, account.id);
    sendSuccess(res, { synced }, `Synced ${synced} new emails`);
  } catch (err) {
    next(err);
  }
};

// ── Get email threads (paginated) ─────────────────────────────────────────
export const getEmailThreads = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const category = (req.query.category as EmailCategory) ?? 'INBOX';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const priority = req.query.priority as Priority | undefined;

    const { threads, total } = await getThreads(userId, category, page, limit, priority);
    sendPaginated(res, threads, total, page, limit, 'Threads fetched');
  } catch (err) {
    next(err);
  }
};

// ── Get single thread with messages ───────────────────────────────────────
export const getThread = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { threadId } = req.params;
    const userId = req.user!.userId;

    const thread = await prisma.emailThread.findUnique({
      where: { id: threadId, userId },
      include: {
        messages: { orderBy: { sentAt: 'asc' } },
        aiDrafts: { orderBy: { createdAt: 'desc' }, take: 3 },
        followUps: { where: { status: 'PENDING' } },
      },
    });
    if (!thread) throw new AppError('Thread not found', 404);

    // Mark as read
    if (!thread.isRead) {
      await prisma.emailThread.update({ where: { id: threadId }, data: { isRead: true } });
    }

    sendSuccess(res, thread);
  } catch (err) {
    next(err);
  }
};

// ── Archive a thread ───────────────────────────────────────────────────────
export const archiveThread = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { threadId } = req.params;
    const userId = req.user!.userId;

    await prisma.emailThread.update({
      where: { id: threadId, userId },
      data: { isArchived: true, category: 'ARCHIVED' },
    });
    sendSuccess(res, null, 'Thread archived');
  } catch (err) {
    next(err);
  }
};

// ── Send reply ─────────────────────────────────────────────────────────────
export const sendReply = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { threadId } = req.params;
    const { body, draftId } = req.body;
    const userId = req.user!.userId;

    const thread = await prisma.emailThread.findUnique({
      where: { id: threadId, userId },
      include: { account: true },
    });
    if (!thread) throw new AppError('Thread not found', 404);

    await sendEmail(
      thread.accountId,
      thread.fromEmail,
      `Re: ${thread.subject}`,
      body,
      thread.gmailThreadId
    );

    // Mark draft as sent if applicable
    if (draftId) {
      await prisma.aiDraft.update({
        where: { id: draftId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }

    sendSuccess(res, null, 'Reply sent successfully');
  } catch (err) {
    next(err);
  }
};

// ── Create follow-up reminder ──────────────────────────────────────────────
export const createFollowUp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { threadId } = req.params;
    const { dueAt, note } = req.body;
    const userId = req.user!.userId;

    const followUp = await prisma.followUp.create({
      data: { threadId, userId, dueAt: new Date(dueAt), note },
    });
    sendSuccess(res, followUp, 'Follow-up reminder created');
  } catch (err) {
    next(err);
  }
};

// ── Get inbox stats ────────────────────────────────────────────────────────
export const getInboxStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const [unread, highPriority, waitingReply, newsletters, pendingFollowUps] = await Promise.all([
      prisma.emailThread.count({ where: { userId, isRead: false, isArchived: false } }),
      prisma.emailThread.count({ where: { userId, priority: 'HIGH', isArchived: false } }),
      prisma.emailThread.count({ where: { userId, category: 'WAITING_REPLY', isArchived: false } }),
      prisma.emailThread.count({ where: { userId, category: 'NEWSLETTERS', isArchived: false } }),
      prisma.followUp.count({ where: { userId, status: 'PENDING' } }),
    ]);

    sendSuccess(res, { unread, highPriority, waitingReply, newsletters, pendingFollowUps });
  } catch (err) {
    next(err);
  }
};