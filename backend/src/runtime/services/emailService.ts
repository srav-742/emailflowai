import { getState, setState } from '../../data/mockData.js';
import {
  emailCategories,
  type DashboardPayload,
  type EmailCategory,
  type EmailThread,
  type EmailThreadSummary,
  type MetricSnapshot,
  type SyncResult,
} from '../../types.js';
import { buildMorningBrief } from './aiService.js';
import { AppError } from '../errors.js';

const categoryLabels: Record<EmailCategory, string> = {
  FOCUS_TODAY: 'Focus Today',
  READ_LATER: 'Read Later',
  NEWSLETTERS: 'Newsletters',
  WAITING_REPLY: 'Waiting for Reply',
};

const priorityRank = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
} as const;

function toSummary(thread: EmailThread): EmailThreadSummary {
  const { messages, draftReply, ...summary } = thread;
  void messages;
  void draftReply;
  return summary;
}

function matchesSearch(thread: EmailThread, search: string) {
  if (!search.trim()) {
    return true;
  }

  const haystack = [
    thread.subject,
    thread.snippet,
    thread.senderName,
    thread.senderEmail,
    thread.tags.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(search.trim().toLowerCase());
}

function getCategoryCounts(threads: EmailThread[]) {
  return emailCategories.reduce<Record<EmailCategory, number>>((accumulator, category) => {
    accumulator[category] = threads.filter((thread) => thread.category === category).length;
    return accumulator;
  }, {} as Record<EmailCategory, number>);
}

function buildMetrics(unreadCount: number, highPriorityCount: number, waitingReplyCount: number) {
  const state = getState();

  const metrics: MetricSnapshot[] = [
    {
      id: 'unread',
      label: 'Unread',
      value: String(unreadCount),
      trend: 'Across connected accounts',
      tone: 'ink',
    },
    {
      id: 'priority',
      label: 'High priority',
      value: String(highPriorityCount),
      trend: 'Ready for focused response',
      tone: 'sunset',
    },
    {
      id: 'waiting',
      label: 'Waiting reply',
      value: String(waitingReplyCount),
      trend: 'Automations watching these threads',
      tone: 'teal',
    },
    {
      id: 'saved',
      label: 'Hours saved',
      value: `${state.user.timeSavedHours}h`,
      trend: 'Estimated weekly time reduction',
      tone: 'sand',
    },
  ];

  return metrics;
}

function sortThreads(threads: EmailThread[]) {
  return [...threads].sort((left: EmailThread, right: EmailThread) => {
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime();
  });
}

export function buildDashboard(category: EmailCategory, search: string): DashboardPayload {
  const state = getState();
  const sortedThreads: EmailThread[] = sortThreads(state.threads);
  const categoryCounts = getCategoryCounts(sortedThreads);
  const filteredThreads = sortedThreads
    .filter((thread) => thread.category === category)
    .filter((thread) => matchesSearch(thread, search));

  const unreadCount = sortedThreads.filter((thread) => thread.unread).length;
  const highPriorityCount = sortedThreads.filter((thread) => thread.priority === 'HIGH').length;
  const waitingReplyCount = sortedThreads.filter((thread) => thread.category === 'WAITING_REPLY').length;

  return {
    user: state.user,
    brief: buildMorningBrief(),
    highlights: [
      'Focus Today isolates what genuinely needs you this morning.',
      'AI drafts stay editable, so the user keeps final control before sending.',
      'Waiting Reply keeps follow-up debt visible without spamming notifications.',
    ],
    metrics: buildMetrics(unreadCount, highPriorityCount, waitingReplyCount),
    analytics: {
      ...state.analytics,
      focusToday: categoryCounts.FOCUS_TODAY,
      waitingReply: categoryCounts.WAITING_REPLY,
    },
    accounts: state.accounts,
    automations: state.automations,
    categoryCounts,
    threads: filteredThreads.map((thread) => toSummary(thread)),
    activeCategory: category,
    activeCategoryLabel: categoryLabels[category],
    lastSyncAt: state.lastSyncAt,
  };
}

export function getThread(threadId: string) {
  const thread = getState().threads.find((item) => item.id === threadId);

  if (!thread) {
    throw new AppError('Thread not found.', 404);
  }

  return thread;
}

export function syncMailbox(): SyncResult {
  const state = getState();
  const nextState = structuredClone(state);
  const newestThread = nextState.pendingSyncThreads.shift() ?? null;
  const nextSyncAt = new Date().toISOString();

  nextState.lastSyncAt = nextSyncAt;
  nextState.accounts = nextState.accounts.map((account, index) =>
    index === 0
      ? {
          ...account,
          syncedAt: nextSyncAt,
          unreadCount: account.unreadCount + (newestThread ? 1 : 0),
        }
      : account,
  );

  if (newestThread) {
    nextState.threads.unshift(newestThread);
    nextState.analytics.importantThisWeek += newestThread.priority === 'HIGH' ? 1 : 0;
  }

  setState(nextState);

  return {
    added: newestThread ? 1 : 0,
    lastSyncAt: nextSyncAt,
    newestThreadId: newestThread?.id ?? null,
  };
}

export function sendReply(threadId: string, body: string) {
  const state = getState();
  const nextState = structuredClone(state);
  const nextThread = nextState.threads.find((item) => item.id === threadId);

  if (!nextThread) {
    throw new AppError('Thread not found.', 404);
  }

  nextThread.messages.push({
    id: `outbound-${threadId}-${nextThread.messages.length + 1}`,
    senderName: 'Sravy',
    senderEmail: nextState.user.email,
    direction: 'OUTBOUND',
    sentAt: new Date().toISOString(),
    body,
  });
  nextThread.draftReply = body;
  nextThread.unread = false;
  nextThread.requiresReply = false;
  nextThread.category = 'WAITING_REPLY';
  nextThread.nextActionLabel = 'Follow up in 2 days if needed';

  setState(nextState);
  return nextThread;
}
