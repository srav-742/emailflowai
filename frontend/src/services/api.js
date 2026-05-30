import axios from 'axios';
import { clearGmailReconnectState, isGmailReconnectError, setGmailReconnectState } from '../utils/gmailReconnect';

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

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => {
    if (response?.config?.url === '/auth/profile' && response?.data?.user?.hasGmailAccess) {
      clearGmailReconnectState();
    }

    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (isGmailReconnectError(error)) {
      setGmailReconnectState({
        message: error?.response?.data?.error || error?.message || 'Google access needs to be reconnected.',
        source: error?.config?.url || 'api',
      });
    }

    // Auto JWT Refresh on 401 Expiry
    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/firebase-login')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          // Use direct axios post to bypass standard interceptor loop
          const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { token: newToken, refreshToken: newRefreshToken } = res.data;

          localStorage.setItem('token', newToken);
          if (newRefreshToken) {
            localStorage.setItem('refreshToken', newRefreshToken);
          }

          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          originalRequest.headers.Authorization = `Bearer ${newToken}`;

          processQueue(null, newToken);
          isRefreshing = false;

          return api(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          isRefreshing = false;

          // Clear local credentials on authentication revocation
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          window.dispatchEvent(new Event('auth:session_expired'));

          return Promise.reject(refreshError);
        }
      } else {
        // CRITICAL FIX: If there's no refresh token, we MUST reset isRefreshing and flush the queue!
        processQueue(error, null);
        isRefreshing = false;
        
        localStorage.removeItem('token');
        window.dispatchEvent(new Event('auth:session_expired'));
        
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  firebaseLogin: (idToken, googleAccessToken) => api.post('/auth/firebase-login', { idToken, googleAccessToken }),
  getGmailAuthUrl: () => api.get('/auth/gmail/url'),
  connectGmail: (tokens) => api.post('/auth/gmail/connect', { tokens }),
  getProfile: () => api.get('/auth/profile'),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  registerAndSendOtp: ({ name, email, password, type }) => api.post('/auth/register-otp', { name, email, password, type }),
  verifyOtp: ({ email, otp }) => api.post('/auth/verify-otp', { email, otp }),
  resendOtp: ({ email, type }) => api.post('/auth/resend-otp', { email, type }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
};


// Email APIs
export const emailAPI = {
  fetchEmails: () => api.get('/emails/fetch'),
  syncEmails: (accountId) => api.get('/emails/sync', { params: accountId ? { accountId } : {} }),
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
  aiGenerateReply: (id, tone = 'professional', intent = 'general') => api.post(`/emails/ai/${id}/reply`, { tone, intent }),
  aiProcessAll: () => api.post('/emails/ai/process-all'),
  getCategoryCounts: (params = {}) => api.get('/emails/counts', { params }),
  updateEmailCategory: (id, category) => api.patch(`/emails/${id}/category`, { category }),
};

export const mailAPI = {
  connect: (data) => api.post('/mail/connect', data),
  testConnection: (data) => api.post('/mail/test-connection', data),
  detectProvider: (email) => api.get('/mail/detect-provider', { params: { email } }),
  providers: () => api.get('/mail/providers'),
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
  generateDigest: () => api.post('/digest/generate'),
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

export const accountAPI = {
  list: () => api.get('/accounts'),
  update: (id, data) => api.patch(`/accounts/${id}`, data),
  disconnect: (id) => api.delete(`/accounts/${id}`),
};

export const semanticAPI = {
  status: () => api.get('/ai/semantic/status'),
  index: (data = {}) => api.post('/ai/semantic/index', data),
  search: (query, options = {}) => api.post('/ai/semantic/query', { query, ...options }),
  searchLegacy: (params = {}) => api.get('/semantic/search', { params }),
};

export const memoryAPI = {
  query: (question) => api.post('/ai/memory/query', { question }),
  overview: () => api.get('/ai/memory/overview'),
};

export const agentAPI = {
  list: (status = null) => api.get('/agent/workflows', { params: status ? { status } : {} }),
  approve: (id) => api.post(`/agent/workflows/${id}/approve`),
  reject: (id) => api.post(`/agent/workflows/${id}/reject`),
};

export const stage3API = {
  verify: () => api.get('/ai/stage3/verify'),
};

export const automationAPI = {
  list: () => api.get('/automation/list'),
  create: (prompt) => api.post('/automation/create', { prompt }),
  test: (workflowJson) => api.post('/automation/test', { workflowJson }),
  toggle: (id, enabled) => api.post('/automation/toggle', { id, enabled }),
  delete: (id) => api.delete(`/automation/${id}`),
  runs: () => api.get('/automation/runs'),
};

export const documentAPI = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  list: () => api.get('/documents'),
  get: (id) => api.get(`/documents/${id}`),
  search: (q) => api.get('/documents/search', { params: { q } }),
  delete: (id) => api.delete(`/documents/${id}`),
  syncEmails: () => api.post('/documents/sync-emails'),
};

export const campaignAPI = {
  list: () => api.get('/campaigns/list'),
  create: (data) => api.post('/campaigns/create', data),
  start: (campaignId) => api.post('/campaigns/start', { campaignId }),
  pause: (campaignId) => api.post('/campaigns/pause', { campaignId }),
  test: (data) => api.post('/campaigns/test', data),
  generateAI: (prompt) => api.post('/campaigns/generate-ai', { prompt }),
  getContacts: (campaignId) => api.get(`/campaigns/${campaignId}/contacts`),
  importContacts: (campaignId, contacts) => api.post(`/campaigns/${campaignId}/contacts/import`, { contacts }),
  getAnalytics: () => api.get('/campaigns/analytics'),
};

export default api;

