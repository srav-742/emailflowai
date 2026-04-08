/*
// src/services/api.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ───────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: handle 401 with token refresh ───────────────────
let isRefreshing = false;
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const { refreshToken, updateTokens, clearAuth } = useAuthStore.getState();

      if (!refreshToken) {
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        const newToken = data.data.accessToken as string;
        updateTokens(newToken);
        processQueue(null, newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuth();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Show toast for API errors (except 401 which we handle above)
    if (error.response?.status !== 401) {
      const message =
        (error.response?.data as { message?: string })?.message ??
        error.message ??
        'Something went wrong';
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
*/

import type {
  ApiEnvelope,
  DashboardPayload,
  DraftResponse,
  EmailCategory,
  EmailThread,
  ReplyResponse,
  SyncResponse,
} from '@/types/email';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, options?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Something went wrong while talking to the API.');
  }

  return payload;
}

export const api = {
  async getDashboard(category: EmailCategory, search: string) {
    const searchParams = new URLSearchParams({ category });

    if (search.trim()) {
      searchParams.set('search', search.trim());
    }

    const payload = await request<DashboardPayload>(`/api/dashboard?${searchParams.toString()}`);
    return payload.data;
  },

  async getThread(threadId: string) {
    const payload = await request<EmailThread>(`/api/emails/${threadId}`);
    return payload.data;
  },

  async syncMailbox() {
    return request<SyncResponse>('/api/emails/sync', {
      method: 'POST',
    });
  },

  async generateDraft(threadId: string, instruction: string) {
    return request<DraftResponse>(`/api/ai/threads/${threadId}/draft`, {
      method: 'POST',
      body: JSON.stringify({ instruction }),
    });
  },

  async sendReply(threadId: string, body: string) {
    return request<ReplyResponse>(`/api/emails/${threadId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
};
