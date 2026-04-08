// src/services/email.service.ts
import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/db';
import { cache } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { EmailCategory, Priority } from '@prisma/client';

interface ParsedEmail {
  gmailThreadId: string;
  gmailMsgId: string;
  subject: string;
  snippet: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  body: string;
  htmlBody?: string;
  labelIds: string[];
  sentAt: Date;
}

// ── Build authenticated Gmail client for a user ────────────────────────────
export async function getGmailClient(accountId: string): Promise<gmail_v1.Gmail> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Email account not found');

  const oauth2Client = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    expiry_date: account.tokenExpiry.getTime(),
  });

  // Auto-refresh token if expired
  oauth2Client.on('tokens', async (newTokens) => {
    if (newTokens.access_token) {
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: {
          accessToken: newTokens.access_token,
          ...(newTokens.refresh_token && { refreshToken: newTokens.refresh_token }),
          tokenExpiry: new Date(newTokens.expiry_date ?? Date.now() + 3600000),
        },
      });
    }
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// ── Parse Gmail message headers ────────────────────────────────────────────
function extractHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function decodeBody(part: gmail_v1.Schema$MessagePart): string {
  if (!part.body?.data) return '';
  return Buffer.from(part.body.data, 'base64').toString('utf-8');
}

function extractParts(payload: gmail_v1.Schema$MessagePart): { text: string; html: string } {
  let text = '';
  let html = '';

  if (payload.mimeType === 'text/plain') text = decodeBody(payload);
  else if (payload.mimeType === 'text/html') html = decodeBody(payload);
  else if (payload.parts) {
    for (const part of payload.parts) {
      const { text: t, html: h } = extractParts(part);
      text += t;
      html += h;
    }
  }
  return { text, html };
}

// ── Parse raw Gmail message ────────────────────────────────────────────────
function parseGmailMessage(msg: gmail_v1.Schema$Message, threadId: string): ParsedEmail | null {
  if (!msg.payload || !msg.id) return null;

  const headers = msg.payload.headers ?? [];
  const from = extractHeader(headers, 'From');
  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? [null, null, from];

  const { text, html } = extractParts(msg.payload);

  return {
    gmailThreadId: threadId,
    gmailMsgId: msg.id,
    subject: extractHeader(headers, 'Subject'),
    snippet: msg.snippet ?? '',
    fromEmail: fromMatch[2] ?? from,
    fromName: fromMatch[1]?.replace(/"/g, '').trim() ?? '',
    toEmails: extractHeader(headers, 'To').split(',').map((e) => e.trim()),
    body: text.trim(),
    htmlBody: html || undefined,
    labelIds: msg.labelIds ?? [],
    sentAt: new Date(parseInt(msg.internalDate ?? '0')),
  };
}

// ── Sync latest emails for a user's account ───────────────────────────────
export async function syncEmails(userId: string, accountId: string, maxResults = 50): Promise<number> {
  const gmail = await getGmailClient(accountId);
  let synced = 0;

  try {
    const threadsRes = await gmail.users.threads.list({
      userId: 'me',
      maxResults,
      labelIds: ['INBOX'],
    });

    const threads = threadsRes.data.threads ?? [];

    for (const thread of threads) {
      if (!thread.id) continue;

      // Skip if already in DB (incremental sync)
      const existing = await prisma.emailThread.findFirst({
        where: { gmailThreadId: thread.id, userId },
      });

      const threadData = await gmail.users.threads.get({ userId: 'me', id: thread.id });
      const messages = threadData.data.messages ?? [];
      if (!messages.length) continue;

      const firstMsg = messages[0];
      const parsed = parseGmailMessage(firstMsg, thread.id);
      if (!parsed) continue;

      const isRead = !parsed.labelIds.includes('UNREAD');
      const isStarred = parsed.labelIds.includes('STARRED');

      // Determine category based on labels
      let category: EmailCategory = 'INBOX';
      if (parsed.labelIds.includes('CATEGORY_PROMOTIONS') || parsed.labelIds.includes('CATEGORY_UPDATES')) {
        category = 'NEWSLETTERS';
      }

      if (!existing) {
        const emailThread = await prisma.emailThread.create({
          data: {
            userId,
            accountId,
            gmailThreadId: thread.id,
            subject: parsed.subject,
            snippet: parsed.snippet,
            fromEmail: parsed.fromEmail,
            fromName: parsed.fromName,
            toEmails: parsed.toEmails,
            labelIds: parsed.labelIds,
            isRead,
            isStarred,
            category,
            sentAt: parsed.sentAt,
          },
        });

        // Store all messages in the thread
        for (const msg of messages) {
          const p = parseGmailMessage(msg, thread.id);
          if (!p) continue;
          await prisma.emailMessage.upsert({
            where: { gmailMsgId: p.gmailMsgId },
            create: {
              threadId: emailThread.id,
              gmailMsgId: p.gmailMsgId,
              fromEmail: p.fromEmail,
              fromName: p.fromName,
              body: p.body,
              htmlBody: p.htmlBody,
              sentAt: p.sentAt,
            },
            update: {},
          });
        }
        synced++;
      }
    }

    // Update last sync time
    await prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() },
    });

    // Invalidate cache
    await cache.delPattern(`threads:${userId}:*`);

    logger.info(`Synced ${synced} new threads for user ${userId}`);
  } catch (error) {
    logger.error('Email sync error:', error);
    throw error;
  }

  return synced;
}

// ── Send email via Gmail API ───────────────────────────────────────────────
export async function sendEmail(
  accountId: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<void> {
  const gmail = await getGmailClient(accountId);

  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];

  const raw = Buffer.from(emailLines.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      ...(threadId && { threadId }),
    },
  });
}

// ── Get threads with pagination + caching ─────────────────────────────────
export async function getThreads(
  userId: string,
  category: EmailCategory,
  page: number,
  limit: number,
  priority?: Priority
) {
  const cacheKey = `threads:${userId}:${category}:${page}:${limit}:${priority ?? 'all'}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const where = {
    userId,
    category,
    isArchived: false,
    ...(priority && { priority }),
  };

  const [threads, total] = await Promise.all([
    prisma.emailThread.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { sentAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        _count: { select: { messages: true } },
        aiDrafts: { where: { status: 'PENDING' }, take: 1 },
      },
    }),
    prisma.emailThread.count({ where }),
  ]);

  const result = { threads, total };
  await cache.set(cacheKey, result, 120); // 2 min cache
  return result;
}