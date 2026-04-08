/*
// src/hooks/useEmails.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { EmailCategory, EmailThread, InboxStats, PaginatedResponse } from '@/types/email';
import toast from 'react-hot-toast';

// ── Inbox stats ────────────────────────────────────────────────────────────
export function useInboxStats() {
  return useQuery({
    queryKey: ['inbox-stats'],
    queryFn: async (): Promise<InboxStats> => {
      const { data } = await api.get('/emails/stats');
      return data.data;
    },
    refetchInterval: 60_000, // auto-refresh every minute
  });
}

// ── Email threads ──────────────────────────────────────────────────────────
export function useEmailThreads(category: EmailCategory, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['threads', category, page, limit],
    queryFn: async (): Promise<PaginatedResponse<EmailThread>> => {
      const { data } = await api.get('/emails/threads', {
        params: { category, page, limit },
      });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

// ── Single thread ──────────────────────────────────────────────────────────
export function useEmailThread(threadId: string | null) {
  return useQuery({
    queryKey: ['thread', threadId],
    queryFn: async (): Promise<EmailThread> => {
      const { data } = await api.get(`/emails/threads/${threadId}`);
      return data.data;
    },
    enabled: !!threadId,
  });
}

// ── Sync emails ────────────────────────────────────────────────────────────
export function useSyncEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/emails/sync');
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['inbox-stats'] });
      toast.success(`Synced ${data.data.synced} new emails`);
    },
  });
}

// ── Archive thread ─────────────────────────────────────────────────────────
export function useArchiveThread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      await api.patch(`/emails/threads/${threadId}/archive`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['inbox-stats'] });
      toast.success('Thread archived');
    },
  });
}

// ── Send reply ─────────────────────────────────────────────────────────────
export function useSendReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, body, draftId }: { threadId: string; body: string; draftId?: string }) => {
      await api.post(`/emails/threads/${threadId}/reply`, { body, draftId });
    },
    onSuccess: (_data, { threadId }) => {
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
      toast.success('Reply sent!');
    },
  });
}

// ── AI: Summarize ──────────────────────────────────────────────────────────
export function useSummarize(threadId: string) {
  return useQuery({
    queryKey: ['summary', threadId],
    queryFn: async (): Promise<string> => {
      const { data } = await api.get(`/ai/threads/${threadId}/summarize`);
      return data.data.summary;
    },
    enabled: false, // manually triggered
    staleTime: Infinity,
  });
}

// ── AI: Draft reply ────────────────────────────────────────────────────────
export function useDraftReply() {
  return useMutation({
    mutationFn: async ({ threadId, instruction }: { threadId: string; instruction?: string }) => {
      const { data } = await api.post(`/ai/threads/${threadId}/draft`, { instruction });
      return data.data.draft as string;
    },
  });
}

// ── AI: Morning brief ──────────────────────────────────────────────────────
export function useMorningBrief() {
  return useQuery({
    queryKey: ['morning-brief'],
    queryFn: async (): Promise<string> => {
      const { data } = await api.get('/ai/morning-brief');
      return data.data.brief;
    },
    staleTime: 1000 * 60 * 60 * 6, // 6 hours
  });
}

// ── AI: Extract action items ───────────────────────────────────────────────
export function useExtractTasks() {
  return useMutation({
    mutationFn: async (threadId: string) => {
      const { data } = await api.get(`/ai/threads/${threadId}/tasks`);
      return data.data.actionItems as string[];
    },
  });
}
*/

import { useDeferredValue, useEffect, useState, useTransition } from 'react';
import { api } from '@/services/api';
import type { DashboardPayload, EmailCategory, EmailThread } from '@/types/email';

export function useEmails() {
  const [category, setCategoryState] = useState<EmailCategory>('FOCUS_TODAY');
  const [searchText, setSearchText] = useState('');
  const deferredSearch = useDeferredValue(searchText);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [composerText, setComposerText] = useState('');
  const [instruction, setInstruction] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCategoryPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setIsLoadingDashboard(true);
      setError(null);

      try {
        const nextDashboard = await api.getDashboard(category, deferredSearch);

        if (cancelled) {
          return;
        }

        setDashboard(nextDashboard);

        const nextSelectedThreadId =
          selectedThreadId && nextDashboard.threads.some((thread) => thread.id === selectedThreadId)
            ? selectedThreadId
            : nextDashboard.threads[0]?.id ?? null;

        setSelectedThreadId(nextSelectedThreadId);
        setStatusMessage(
          `Loaded ${nextDashboard.threads.length} threads in ${nextDashboard.activeCategoryLabel}.`,
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDashboard(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [category, deferredSearch, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null);
      setComposerText('');
      return;
    }

    const threadId = selectedThreadId;
    let cancelled = false;

    async function loadThread() {
      setIsLoadingThread(true);
      setError(null);

      try {
        const nextThread = await api.getThread(threadId);

        if (!cancelled) {
          setSelectedThread(nextThread);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load thread details.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingThread(false);
        }
      }
    }

    void loadThread();

    return () => {
      cancelled = true;
    };
  }, [selectedThreadId]);

  useEffect(() => {
    setComposerText(selectedThread?.draftReply ?? '');
    setInstruction('');
  }, [selectedThread]);

  async function syncMailbox() {
    setIsSyncing(true);
    setError(null);

    try {
      const result = await api.syncMailbox();
      setStatusMessage(result.message);
      const nextDashboard = await api.getDashboard(category, deferredSearch);
      setDashboard(nextDashboard);

      if (result.data.newestThreadId) {
        setSelectedThreadId(result.data.newestThreadId);
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to sync the inbox.');
    } finally {
      setIsSyncing(false);
    }
  }

  async function generateDraft() {
    if (!selectedThreadId) {
      return;
    }

    setIsGeneratingDraft(true);
    setError(null);

    try {
      const result = await api.generateDraft(selectedThreadId, instruction);
      setComposerText(result.data.draftReply);
      setStatusMessage(result.message);
      setSelectedThread(await api.getThread(selectedThreadId));
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Unable to generate a draft.');
    } finally {
      setIsGeneratingDraft(false);
    }
  }

  async function sendReply() {
    if (!selectedThreadId || !composerText.trim()) {
      return;
    }

    setIsSendingReply(true);
    setError(null);

    try {
      const result = await api.sendReply(selectedThreadId, composerText);
      setSelectedThread(result.data.thread);
      setStatusMessage(result.message);
      setDashboard(await api.getDashboard(category, deferredSearch));
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to send reply.');
    } finally {
      setIsSendingReply(false);
    }
  }

  function setCategory(categoryValue: EmailCategory) {
    startTransition(() => {
      setCategoryState(categoryValue);
    });
  }

  return {
    dashboard,
    category,
    searchText,
    selectedThreadId,
    selectedThread,
    composerText,
    instruction,
    error,
    statusMessage,
    isLoadingDashboard,
    isLoadingThread,
    isGeneratingDraft,
    isSendingReply,
    isSyncing,
    isCategoryPending,
    setCategory,
    setSearchText,
    selectThread: setSelectedThreadId,
    setComposerText,
    setInstruction,
    syncMailbox,
    generateDraft,
    sendReply,
  };
}
