import { Router } from '../../utils/router.js';
import { isEmailCategory } from '../../types.js';
import { buildMorningBrief, generateDraft } from '../services/aiService.js';
import { buildDashboard, getThread, sendReply, syncMailbox } from '../services/emailService.js';
import { AppError } from '../errors.js';
import { sendError, sendSuccess } from '../http.js';
import { getState } from '../../data/mockData.js';
import { google } from 'googleapis';
import { env } from '../../config/env.js';

function requireBody(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('A JSON body is required.', 400);
  }

  return body as Record<string, unknown>;
}

function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`${label} is required.`, 400);
  }

  return value.trim();
}

export function registerRoutes(router: Router) {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );

  router.get('/api/auth/google', ({ res }) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    });

    res.writeHead(302, { Location: url });
    res.end();
  });

  router.get('/auth/google/callback', async ({ res, query }) => {
    const code = query.get('code');
    if (!code) {
      throw new AppError('Google callback code is required.', 400);
    }

    const { tokens } = await oauth2Client.getToken(code);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token ?? '',
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new AppError('Unable to resolve Google user email.', 400);
    }

    const redirectUrl = new URL(`${env.FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set('name', payload.name ?? payload.email);
    redirectUrl.searchParams.set('email', payload.email);
    if (payload.picture) redirectUrl.searchParams.set('picture', payload.picture);
    if (tokens.access_token) redirectUrl.searchParams.set('token', tokens.access_token);
    if (tokens.refresh_token) redirectUrl.searchParams.set('refresh', tokens.refresh_token);

    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
  });

  router.get('/api/health', ({ res }) => {
    sendSuccess(
      res,
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
      'EmailFlow AI backend is healthy.',
    );
  });

  router.get('/api/auth/me', ({ res }) => {
    const state = getState();
    sendSuccess(
      res,
      {
        user: state.user,
        accounts: state.accounts,
      },
      'Demo session loaded.',
    );
  });

  router.get('/api/dashboard', ({ res, query }) => {
    const category = query.get('category');

    if (!isEmailCategory(category)) {
      throw new AppError('Invalid category filter.', 400);
    }

    const payload = buildDashboard(category, query.get('search') ?? '');
    sendSuccess(res, payload, 'Dashboard loaded.');
  });

  router.get('/api/ai/morning-brief', ({ res }) => {
    sendSuccess(
      res,
      {
        brief: buildMorningBrief(),
      },
      'Morning brief loaded.',
    );
  });

  router.get('/api/emails/:threadId', ({ res, params }) => {
    sendSuccess(res, getThread(params.threadId), 'Thread loaded.');
  });

  router.post('/api/emails/sync', ({ res }) => {
    sendSuccess(res, syncMailbox(), 'Inbox sync completed.');
  });

  router.post('/api/emails/:threadId/reply', ({ res, params, body }) => {
    const payload = requireBody(body);
    const thread = sendReply(params.threadId, requireText(payload.body, 'Reply body'));
    sendSuccess(res, { thread }, 'Reply sent and moved to Waiting for Reply.');
  });

  router.post('/api/ai/threads/:threadId/draft', ({ res, params, body }) => {
    const payload = requireBody(body);
    const instruction = typeof payload.instruction === 'string' ? payload.instruction : '';
    sendSuccess(res, generateDraft(params.threadId, instruction), 'AI draft refreshed.');
  });

  router.get('/api/ai/threads/:threadId/summarize', ({ res, params }) => {
    sendSuccess(
      res,
      {
        summary: getThread(params.threadId).aiSummary,
      },
      'AI summary loaded.',
    );
  });

  router.get('/api/ai/threads/:threadId/tasks', ({ res, params }) => {
    sendSuccess(
      res,
      {
        actionItems: getThread(params.threadId).actionItems,
      },
      'Action items loaded.',
    );
  });

  router.get('/api/ai/threads/:threadId/classify', ({ res, params }) => {
    sendSuccess(
      res,
      {
        priority: getThread(params.threadId).priority,
      },
      'Priority loaded.',
    );
  });

  router.get('/api/:unknown', ({ res }) => {
    sendError(res, 'Unknown API route.', 404);
  });
}
