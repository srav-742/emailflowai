import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth APIs
export const authAPI = {
  firebaseLogin: (idToken, googleAccessToken) => api.post('/auth/firebase-login', { idToken, googleAccessToken }),
  getGmailAuthUrl: () => api.get('/auth/gmail/url'),
  connectGmail: (tokens) => api.post('/auth/gmail/connect', { tokens }),
  getProfile: () => api.get('/auth/profile'),
  logout: () => api.post('/auth/logout'),
};

// Email APIs
export const emailAPI = {
  fetchEmails: () => api.get('/emails/fetch'),
  syncEmails: () => api.get('/emails/sync'),
  getEmails: (params = {}) => api.get('/emails', { params }),
  getThreads: (params = {}) => api.get('/emails/threads', { params }),
  searchEmails: (params = {}) => api.get('/emails/search', { params }),
  getThreadById: (threadId) => api.get(`/emails/threads/${threadId}`),
  getEmailById: (id) => api.get(`/emails/${id}`),
  getStats: () => api.get('/emails/stats'),
  classifyEmails: () => api.post('/emails/classify'),
  summarizeEmail: (id) => api.post(`/emails/${id}/summarize`),
  extractTasks: (id) => api.post(`/emails/${id}/extract-tasks`),
  sendReply: (id, body, options = {}) => api.post(`/emails/${id}/reply/send`, { body, ...options }),

  aiSummarize: (id) => api.post(`/emails/ai/${id}/summarize`),
  aiClassify: (id) => api.post(`/emails/ai/${id}/classify`),
  aiGenerateReply: (id, tone = 'professional') => api.post(`/emails/ai/${id}/reply`, { tone }),
  aiProcessAll: () => api.post('/emails/ai/process-all'),
  getCategoryCounts: () => api.get('/emails/counts'),
  updateEmailCategory: (id, category) => api.patch(`/emails/${id}/category`, { category }),
};

export const aiAPI = {
  getMorningBrief:   () => api.get('/ai/morning-brief'),
  getAnalytics:      () => api.get('/ai/analytics'),
  trainStyle:        () => api.post('/ai/style/train'),
  updatePreferences: (importantContacts) => api.put('/ai/preferences', { importantContacts }),
  getAccounts:       () => api.get('/ai/accounts'),
  getInboxSummary:   (limit = 20) => api.get('/ai/inbox-summary', { params: { limit } }),
};

export const actionItemAPI = {
  getItems: (params = {}) => api.get('/action-items', { params }),
  updateItem: (id, data) => api.patch(`/action-items/${id}`, data),
  deleteItem: (id) => api.delete(`/action-items/${id}`),
  extractFromEmail: (emailId) => api.post(`/action-items/${emailId}/extract`),
};

export const followUpAPI = {
  getItems: () => api.get('/follow-ups'),
  snooze: (id, days) => api.patch(`/follow-ups/${id}/snooze`, { days }),
  dismiss: (id) => api.patch(`/follow-ups/${id}/dismiss`),
};

export const digestAPI = {
  getToday: () => api.get('/digest/today'),
  getPreferences: () => api.get('/digest/preferences'),
  updatePreferences: (data) => api.patch('/digest/preferences', data),
};

export const billingAPI = {
  createCheckout: (priceId) => api.post('/billing/checkout', { priceId }),
  createPortal: () => api.post('/billing/portal'),
  getSubscription: () => api.get('/billing/subscription'),
};

export const calendarAPI = {
  sync: () => api.post('/calendar/sync'),
  getEvents: (days = 7) => api.get('/calendar/events', { params: { days } }),
  getToday: () => api.get('/calendar/today'),
  addReminder: (actionItemId) => api.post('/calendar/add-reminder', { actionItemId }),
};

export default api;
