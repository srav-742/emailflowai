// src/services/ai.service.ts
import OpenAI from 'openai';
import { prisma } from '../config/db';
import { cache } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ActionType, Priority } from '@prisma/client';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Log AI action usage ────────────────────────────────────────────────────
async function logAction(userId: string, actionType: ActionType, inputTokens: number, outputTokens: number): Promise<void> {
  await Promise.all([
    prisma.aiActionLog.create({ data: { userId, actionType, inputTokens, outputTokens } }),
    prisma.user.update({
      where: { id: userId },
      data: { aiActionsUsed: { increment: 1 } },
    }),
  ]);
}

// ── Check AI action quota ──────────────────────────────────────────────────
export async function checkQuota(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, aiActionsUsed: true, aiActionsLimit: true },
  });
  if (!user) return false;
  if (user.plan === 'PRO') return true;
  return user.aiActionsUsed < user.aiActionsLimit;
}

// ── Summarize email thread ─────────────────────────────────────────────────
export async function summarizeThread(
  userId: string,
  threadId: string
): Promise<string> {
  const cacheKey = `summary:${threadId}`;
  const cached = await cache.get<string>(cacheKey);
  if (cached) return cached;

  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId, userId },
    include: { messages: { orderBy: { sentAt: 'asc' }, take: 10 } },
  });
  if (!thread) throw new Error('Thread not found');

  const emailContent = thread.messages
    .map((m) => `From: ${m.fromEmail}\nDate: ${m.sentAt.toISOString()}\n\n${m.body}`)
    .join('\n\n---\n\n');

  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert email summarizer. Summarize email threads in 2-4 sentences. 
        Highlight: main topic, key decisions/requests, and any action needed. Be concise and actionable.`,
      },
      {
        role: 'user',
        content: `Subject: ${thread.subject}\n\n${emailContent}`,
      },
    ],
    max_tokens: 200,
    temperature: 0.3,
  });

  const summary = response.choices[0]?.message?.content ?? 'Could not generate summary.';
  const usage = response.usage;

  // Persist summary and log
  await Promise.all([
    prisma.emailThread.update({ where: { id: threadId }, data: { aiSummary: summary } }),
    logAction(userId, 'SUMMARIZE', usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
    cache.set(cacheKey, summary, 3600),
  ]);

  return summary;
}

// ── Extract action items from thread ─────────────────────────────────────
export async function extractActionItems(userId: string, threadId: string): Promise<string[]> {
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId, userId },
    include: { messages: { orderBy: { sentAt: 'asc' }, take: 5 } },
  });
  if (!thread) throw new Error('Thread not found');

  const content = thread.messages.map((m) => m.body).join('\n\n');

  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `Extract action items from emails. Return a JSON array of strings. 
        Each item should start with a verb. Max 5 items. If none, return [].
        Example: ["Reply to John by Friday", "Schedule meeting for next week", "Send invoice to client"]
        Return ONLY valid JSON array, no other text.`,
      },
      { role: 'user', content },
    ],
    max_tokens: 300,
    temperature: 0.2,
  });

  const raw = response.choices[0]?.message?.content ?? '[]';
  const usage = response.usage;

  try {
    const items = JSON.parse(raw) as string[];
    await Promise.all([
      prisma.emailThread.update({ where: { id: threadId }, data: { aiActionItems: items } }),
      logAction(userId, 'EXTRACT_TASKS', usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
    ]);
    return items;
  } catch {
    return [];
  }
}

// ── Classify email priority ────────────────────────────────────────────────
export async function classifyPriority(userId: string, threadId: string): Promise<Priority> {
  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId, userId },
    include: { messages: { take: 1, orderBy: { sentAt: 'asc' } } },
  });
  if (!thread) return 'NORMAL';

  const body = thread.messages[0]?.body ?? thread.snippet ?? '';

  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `Classify email priority. Return ONLY one word: HIGH, NORMAL, or LOW.
        HIGH: urgent deadlines, action required today, from boss/client, time-sensitive.
        LOW: newsletters, promotions, FYI emails, no action needed.
        NORMAL: everything else.`,
      },
      { role: 'user', content: `Subject: ${thread.subject}\n\n${body.substring(0, 500)}` },
    ],
    max_tokens: 10,
    temperature: 0.1,
  });

  const raw = response.choices[0]?.message?.content?.trim().toUpperCase() ?? 'NORMAL';
  const priority: Priority = ['HIGH', 'NORMAL', 'LOW'].includes(raw) ? (raw as Priority) : 'NORMAL';
  const usage = response.usage;

  await Promise.all([
    prisma.emailThread.update({ where: { id: threadId }, data: { priority } }),
    logAction(userId, 'CLASSIFY', usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
  ]);

  return priority;
}

// ── Draft AI reply ─────────────────────────────────────────────────────────
export async function draftReply(
  userId: string,
  threadId: string,
  instruction?: string
): Promise<string> {
  const [thread, userStyle] = await Promise.all([
    prisma.emailThread.findUnique({
      where: { id: threadId, userId },
      include: { messages: { orderBy: { sentAt: 'asc' }, take: 8 } },
    }),
    prisma.userStyle.findUnique({ where: { userId } }),
  ]);

  if (!thread) throw new Error('Thread not found');

  const emailChain = thread.messages
    .map((m) => `From: ${m.fromEmail}\n${m.body}`)
    .join('\n\n---\n\n');

  const styleContext = userStyle
    ? `Write at formality level ${userStyle.formalityScore.toFixed(1)}/1.0. 
       Preferred reply length: ~${userStyle.avgReplyLength} words.
       ${userStyle.commonPhrases.length > 0 ? `The user commonly uses phrases like: ${userStyle.commonPhrases.slice(0, 5).join(', ')}` : ''}`
    : 'Write in a professional yet friendly tone. Keep replies concise.';

  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a professional email assistant. Draft a reply to the email thread below.
        ${styleContext}
        ${instruction ? `Special instruction: ${instruction}` : ''}
        Write ONLY the email body — no subject line, no "Dear/Hi" salutation unless appropriate.
        Be natural, not robotic.`,
      },
      {
        role: 'user',
        content: `Thread subject: ${thread.subject}\n\n${emailChain}`,
      },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  const draft = response.choices[0]?.message?.content ?? '';
  const usage = response.usage;

  await Promise.all([
    prisma.aiDraft.create({
      data: { threadId, userId, draftText: draft },
    }),
    logAction(userId, 'DRAFT_REPLY', usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
  ]);

  return draft;
}

// ── Morning Brief ──────────────────────────────────────────────────────────
export async function generateMorningBrief(userId: string): Promise<string> {
  const cacheKey = `brief:${userId}:${new Date().toDateString()}`;
  const cached = await cache.get<string>(cacheKey);
  if (cached) return cached;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const [highPriority, unread, pendingFollowUps] = await Promise.all([
    prisma.emailThread.findMany({
      where: { userId, priority: 'HIGH', isArchived: false },
      orderBy: { sentAt: 'desc' },
      take: 5,
      select: { subject: true, fromEmail: true, fromName: true, aiSummary: true },
    }),
    prisma.emailThread.count({ where: { userId, isRead: false, isArchived: false } }),
    prisma.followUp.count({ where: { userId, status: 'PENDING', dueAt: { lte: new Date() } } }),
  ]);

  const summaries = highPriority
    .map((t) => `- "${t.subject}" from ${t.fromName ?? t.fromEmail}: ${t.aiSummary ?? 'No summary yet'}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a friendly, efficient email assistant. Generate a concise morning brief (5-7 sentences max).
        Start with a greeting. Mention unread count, highlight urgent items, and list any follow-ups needed.
        Be warm, actionable, and energizing — like a great personal assistant.`,
      },
      {
        role: 'user',
        content: `Generate today's morning email brief.
        Total unread: ${unread}
        High priority emails:
        ${summaries || 'None'}
        Overdue follow-ups: ${pendingFollowUps}`,
      },
    ],
    max_tokens: 400,
    temperature: 0.8,
  });

  const brief = response.choices[0]?.message?.content ?? "Good morning! Let's get through today's emails.";
  const usage = response.usage;

  await Promise.all([
    cache.set(cacheKey, brief, 6 * 3600), // Cache 6 hours
    logAction(userId, 'MORNING_BRIEF', usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
  ]);

  return brief;
}

// ── Style learning ────────────────────────────────────────────────────────
export async function learnUserStyle(userId: string): Promise<void> {
  // Get last 20 sent emails to analyze writing style
  const sentThreads = await prisma.emailThread.findMany({
    where: { userId },
    include: {
      messages: {
        where: { fromEmail: { contains: '@' } },
        take: 3,
        orderBy: { sentAt: 'desc' },
      },
    },
    take: 20,
  });

  if (sentThreads.length < 5) return; // Not enough data

  const samples = sentThreads
    .flatMap((t) => t.messages)
    .map((m) => m.body)
    .filter((b) => b.length > 30)
    .slice(0, 15)
    .join('\n\n---\n\n');

  const response = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: 'system',
        content: `Analyze these email samples and return a JSON object with:
        {
          "formalityScore": 0.0-1.0 (0=very casual, 1=very formal),
          "avgReplyLength": estimated average word count,
          "commonPhrases": array of 5-10 characteristic phrases the person uses,
          "toneProfile": { "friendly": 0-1, "direct": 0-1, "detailed": 0-1 }
        }
        Return ONLY valid JSON, no other text.`,
      },
      { role: 'user', content: samples },
    ],
    max_tokens: 400,
    temperature: 0.2,
  });

  try {
    const raw = response.choices[0]?.message?.content ?? '{}';
    const style = JSON.parse(raw);
    const usage = response.usage;

    await Promise.all([
      prisma.userStyle.upsert({
        where: { userId },
        create: {
          userId,
          formalityScore: style.formalityScore ?? 0.5,
          avgReplyLength: style.avgReplyLength ?? 150,
          commonPhrases: style.commonPhrases ?? [],
          toneProfile: style.toneProfile ?? {},
        },
        update: {
          formalityScore: style.formalityScore ?? 0.5,
          avgReplyLength: style.avgReplyLength ?? 150,
          commonPhrases: style.commonPhrases ?? [],
          toneProfile: style.toneProfile ?? {},
        },
      }),
      logAction(userId, 'STYLE_LEARN', usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
    ]);

    logger.info(`Updated style profile for user ${userId}`);
  } catch (error) {
    logger.error('Style learning parse error:', error);
  }
}