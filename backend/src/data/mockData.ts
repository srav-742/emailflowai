import type { AppState, EmailThread } from '../types.js';

const threads: EmailThread[] = [
  {
    id: 'focus-001',
    subject: 'Board review deck needs final numbers by 4 PM',
    snippet: 'Finance needs the ARR, burn, and hiring plan before the board preview.',
    senderName: 'Anika Shah',
    senderEmail: 'anika@northstarvc.com',
    category: 'FOCUS_TODAY',
    priority: 'HIGH',
    receivedAt: '2026-04-05T07:45:00.000Z',
    unread: true,
    requiresReply: true,
    tags: ['Board', 'Finance'],
    aiSummary:
      'Finance requested the final ARR, burn multiple, and hiring assumptions before the board review. The thread is urgent because the presentation lock happens at 4 PM today.',
    actionItems: [
      'Reply with updated ARR and burn figures before 4 PM',
      'Confirm the hiring plan assumptions for Q3',
    ],
    estimatedMinutesSaved: 18,
    sentiment: 'Urgent',
    recommendedTone: 'Direct, calm, and confident.',
    nextActionLabel: 'Reply before 4 PM',
    draftReply:
      'Hi Anika,\n\nI am finalizing the board deck now and will send the updated ARR, burn, and hiring plan assumptions shortly. I will make sure the final version is with you before 4 PM.\n\nBest,\nSravy',
    messages: [
      {
        id: 'focus-001-in-1',
        senderName: 'Anika Shah',
        senderEmail: 'anika@northstarvc.com',
        direction: 'INBOUND',
        sentAt: '2026-04-05T07:45:00.000Z',
        body: 'Can you send the final ARR, burn multiple, and hiring plan assumptions before the board preview this afternoon?',
      },
    ],
  },
  {
    id: 'focus-002',
    subject: 'Need your sign-off on the new onboarding flow',
    snippet: 'Product design needs one last decision on the CTA and empty state copy.',
    senderName: 'Maya Lopez',
    senderEmail: 'maya@product.studio',
    category: 'FOCUS_TODAY',
    priority: 'NORMAL',
    receivedAt: '2026-04-05T06:55:00.000Z',
    unread: false,
    requiresReply: true,
    tags: ['Design', 'Product'],
    aiSummary:
      'Design is waiting on your approval for the onboarding CTA language and the empty state behavior. A quick decision keeps the launch on schedule.',
    actionItems: [
      'Approve or revise the onboarding CTA copy',
      'Confirm the empty state behavior before design handoff',
    ],
    estimatedMinutesSaved: 12,
    sentiment: 'Neutral',
    recommendedTone: 'Collaborative and concise.',
    nextActionLabel: 'Approve flow copy',
    draftReply:
      'Hi Maya,\n\nThe onboarding direction looks strong. I am good with the CTA as drafted, and I would keep the empty state focused on the next best action rather than a broad explanation.\n\nThanks,\nSravy',
    messages: [
      {
        id: 'focus-002-in-1',
        senderName: 'Maya Lopez',
        senderEmail: 'maya@product.studio',
        direction: 'INBOUND',
        sentAt: '2026-04-05T06:55:00.000Z',
        body: 'Can you review the latest onboarding flow? We just need your sign-off on the CTA and the empty state copy before we hand it to engineering.',
      },
    ],
  },
  {
    id: 'later-001',
    subject: 'Q3 vendor contract review and pricing options',
    snippet: 'Legal attached three contract options for the analytics vendor renewal.',
    senderName: 'Jordan Kim',
    senderEmail: 'jordan@opsgrid.com',
    category: 'READ_LATER',
    priority: 'NORMAL',
    receivedAt: '2026-04-04T14:25:00.000Z',
    unread: true,
    requiresReply: false,
    tags: ['Ops', 'Contract'],
    aiSummary:
      'Operations shared three contract options for the analytics vendor renewal. It is important, but the decision can wait until after today’s board prep.',
    actionItems: ['Review the three pricing options this week'],
    estimatedMinutesSaved: 9,
    sentiment: 'Calm',
    recommendedTone: 'Analytical and measured.',
    nextActionLabel: 'Review this week',
    draftReply:
      'Hi Jordan,\n\nThanks for putting the options together. I am heads-down on today’s board prep, but I will review the contract paths this week and send you my recommendation.\n\nBest,\nSravy',
    messages: [
      {
        id: 'later-001-in-1',
        senderName: 'Jordan Kim',
        senderEmail: 'jordan@opsgrid.com',
        direction: 'INBOUND',
        sentAt: '2026-04-04T14:25:00.000Z',
        body: 'Legal attached three vendor renewal options for the analytics platform. When you have time, can you review the pricing paths and note your preference?',
      },
    ],
  },
  {
    id: 'news-001',
    subject: 'Weekly AI productivity roundup',
    snippet: 'A curated list of product launches, funding news, and AI workflow ideas.',
    senderName: 'StackPress',
    senderEmail: 'editors@stackpress.co',
    category: 'NEWSLETTERS',
    priority: 'LOW',
    receivedAt: '2026-04-05T05:20:00.000Z',
    unread: true,
    requiresReply: false,
    tags: ['Newsletter', 'AI'],
    aiSummary:
      'This is a low-priority weekly newsletter covering AI launches and industry news. Good for later inspiration, not urgent action.',
    actionItems: ['Skim for useful product-market examples when you have downtime'],
    estimatedMinutesSaved: 6,
    sentiment: 'Calm',
    recommendedTone: 'No reply needed.',
    nextActionLabel: 'Skim later',
    draftReply: '',
    messages: [
      {
        id: 'news-001-in-1',
        senderName: 'StackPress',
        senderEmail: 'editors@stackpress.co',
        direction: 'INBOUND',
        sentAt: '2026-04-05T05:20:00.000Z',
        body: 'This week in AI productivity: new agents, new workflows, and the biggest funding announcements you may have missed.',
      },
    ],
  },
  {
    id: 'wait-001',
    subject: 'Client kickoff timeline for Delta Health',
    snippet: 'You already sent the launch plan and are waiting for client confirmation.',
    senderName: 'Priya Nair',
    senderEmail: 'priya@deltahealth.com',
    category: 'WAITING_REPLY',
    priority: 'NORMAL',
    receivedAt: '2026-04-03T10:10:00.000Z',
    unread: false,
    requiresReply: false,
    tags: ['Client', 'Kickoff'],
    aiSummary:
      'You shared the kickoff timeline and delivery plan with Delta Health. The next move is a follow-up if the client stays silent beyond tomorrow.',
    actionItems: ['Send a follow-up tomorrow morning if no confirmation arrives'],
    estimatedMinutesSaved: 11,
    sentiment: 'Neutral',
    recommendedTone: 'Warm, helpful, and proactive.',
    nextActionLabel: 'Follow up tomorrow',
    draftReply:
      'Hi Priya,\n\nJust checking in on the kickoff timeline I shared earlier this week. If the plan looks good, I can hold the project team for the proposed start date.\n\nBest,\nSravy',
    messages: [
      {
        id: 'wait-001-out-1',
        senderName: 'Sravy',
        senderEmail: 'sravy@emailflow.ai',
        direction: 'OUTBOUND',
        sentAt: '2026-04-03T10:10:00.000Z',
        body: 'Sharing the kickoff timeline and proposed milestones for the Delta Health rollout.',
      },
    ],
  },
];

const pendingSyncThreads: EmailThread[] = [
  {
    id: 'focus-003',
    subject: 'Hot lead wants a proposal revision before noon',
    snippet: 'The prospect is interested, but they need pricing clarified before internal approval.',
    senderName: 'Rahul Menon',
    senderEmail: 'rahul@craftscale.io',
    category: 'FOCUS_TODAY',
    priority: 'HIGH',
    receivedAt: '2026-04-05T08:25:00.000Z',
    unread: true,
    requiresReply: true,
    tags: ['Sales', 'Proposal'],
    aiSummary:
      'A warm lead needs a revised proposal with clearer pricing before noon so they can seek internal approval. This is time-sensitive and revenue-impacting.',
    actionItems: [
      'Revise the proposal pricing before noon',
      'Confirm the start date and onboarding scope',
    ],
    estimatedMinutesSaved: 16,
    sentiment: 'Urgent',
    recommendedTone: 'Fast, reassuring, and commercial.',
    nextActionLabel: 'Update proposal now',
    draftReply:
      'Hi Rahul,\n\nThanks for the quick follow-up. I am revising the proposal now with clearer pricing and delivery scope, and I will send the updated version well before noon.\n\nBest,\nSravy',
    messages: [
      {
        id: 'focus-003-in-1',
        senderName: 'Rahul Menon',
        senderEmail: 'rahul@craftscale.io',
        direction: 'INBOUND',
        sentAt: '2026-04-05T08:25:00.000Z',
        body: 'We are close to approval, but I need a cleaner version of the proposal pricing before noon. Can you turn that around this morning?',
      },
    ],
  },
];

const initialState: AppState = {
  user: {
    id: 'user-001',
    name: 'Sravy Reddy',
    role: 'Founder / AI Workflow Operator',
    email: 'sravy@emailflow.ai',
    plan: 'PRO',
    timeSavedHours: 11.4,
    responseStreak: 23,
    productivityScore: 91,
    focusScore: 88,
  },
  accounts: [
    {
      id: 'acc-gmail',
      provider: 'Gmail',
      email: 'sravy@emailflow.ai',
      status: 'Healthy',
      syncedAt: '2026-04-05T08:10:00.000Z',
      unreadCount: 14,
    },
    {
      id: 'acc-outlook',
      provider: 'Outlook',
      email: 'sravy.work@outlook.com',
      status: 'Standby',
      syncedAt: '2026-04-04T16:40:00.000Z',
      unreadCount: 4,
    },
  ],
  automations: [
    {
      id: 'auto-brief',
      title: 'Morning Brief',
      description: 'Build a concise priority briefing every weekday morning.',
      cadence: 'Weekdays · 8:00 AM',
      status: 'ACTIVE',
    },
    {
      id: 'auto-followup',
      title: 'Waiting Reply Sweep',
      description: 'Flag stale outbound conversations and suggest a follow-up.',
      cadence: 'Daily · 5:30 PM',
      status: 'ACTIVE',
    },
    {
      id: 'auto-news',
      title: 'Newsletter Digest',
      description: 'Collapse low-priority newsletters into one summary card.',
      cadence: 'Paused',
      status: 'PAUSED',
    },
  ],
  threads,
  pendingSyncThreads,
  analytics: {
    timeSavedHours: 11.4,
    draftAcceptance: 86,
    responseRate: 94,
    focusToday: 3,
    waitingReply: 1,
    importantThisWeek: 12,
  },
  lastSyncAt: '2026-04-05T08:10:00.000Z',
};

let state: AppState = structuredClone(initialState);

export function getState() {
  return state;
}

export function setState(nextState: AppState) {
  state = nextState;
}
