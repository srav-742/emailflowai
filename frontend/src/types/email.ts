export type AppView = 'COMMAND_CENTER' | 'ANALYTICS' | 'SETTINGS';
export type EmailCategory = 'FOCUS_TODAY' | 'READ_LATER' | 'NEWSLETTERS' | 'WAITING_REPLY';
export type EmailPriority = 'HIGH' | 'NORMAL' | 'LOW';
export type StatusTone = 'sunset' | 'teal' | 'ink' | 'sand';

export const categoryOrder: EmailCategory[] = [
  'FOCUS_TODAY',
  'READ_LATER',
  'NEWSLETTERS',
  'WAITING_REPLY',
];

export const categoryLabels: Record<EmailCategory, string> = {
  FOCUS_TODAY: 'Focus Today',
  READ_LATER: 'Read Later',
  NEWSLETTERS: 'Newsletters',
  WAITING_REPLY: 'Waiting for Reply',
};

export interface UserProfile {
  id: string;
  name: string;
  role: string;
  email: string;
  plan: 'FREE' | 'PRO';
  timeSavedHours: number;
  responseStreak: number;
  productivityScore: number;
  focusScore: number;
}

export interface MetricSnapshot {
  id: string;
  label: string;
  value: string;
  trend: string;
  tone: StatusTone;
}

export interface AnalyticsSnapshot {
  timeSavedHours: number;
  draftAcceptance: number;
  responseRate: number;
  focusToday: number;
  waitingReply: number;
  importantThisWeek: number;
}

export interface ConnectedAccount {
  id: string;
  provider: string;
  email: string;
  status: string;
  syncedAt: string;
  unreadCount: number;
}

export interface AutomationItem {
  id: string;
  title: string;
  description: string;
  cadence: string;
  status: 'ACTIVE' | 'PAUSED';
}

export interface EmailMessage {
  id: string;
  senderName: string;
  senderEmail: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sentAt: string;
  body: string;
}

export interface EmailThreadSummary {
  id: string;
  subject: string;
  snippet: string;
  senderName: string;
  senderEmail: string;
  category: EmailCategory;
  priority: EmailPriority;
  receivedAt: string;
  unread: boolean;
  requiresReply: boolean;
  tags: string[];
  aiSummary: string;
  actionItems: string[];
  estimatedMinutesSaved: number;
  sentiment: 'Calm' | 'Neutral' | 'Urgent';
  recommendedTone: string;
  nextActionLabel: string;
}

export interface EmailThread extends EmailThreadSummary {
  messages: EmailMessage[];
  draftReply: string;
}

export interface DashboardPayload {
  user: UserProfile;
  brief: string;
  highlights: string[];
  metrics: MetricSnapshot[];
  analytics: AnalyticsSnapshot;
  accounts: ConnectedAccount[];
  automations: AutomationItem[];
  categoryCounts: Record<EmailCategory, number>;
  threads: EmailThreadSummary[];
  activeCategory: EmailCategory;
  activeCategoryLabel: string;
  lastSyncAt: string;
}

export interface SyncResponse {
  added: number;
  lastSyncAt: string;
  newestThreadId: string | null;
}

export interface DraftResponse {
  draftReply: string;
  recommendedTone: string;
}

export interface ReplyResponse {
  thread: EmailThread;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}
