import { create } from 'zustand';

/**
 * emailStore
 * 
 * Central state for the inbox. Handles real-time prepending of new emails
 * and bulk updates from API fetches.
 */
export const useEmailStore = create((set) => ({
  emails: [],
  loading: false,
  error: null,

  setEmails: (newEmails) => set((state) => {
    const merged = new Map();
    // Maintain existing emails or prefer new ones? 
    // Usually new ones have updated stats/summaries.
    newEmails.forEach((email) => merged.set(email.id, email));
    return { emails: Array.from(merged.values()) };
  }),

  addEmail: (email) => set((state) => {
    // Avoid duplicates if SSE and polling overlap
    if (state.emails.some((e) => e.id === email.id || e.messageId === email.messageId)) {
      return state;
    }
    return { emails: [email, ...state.emails] };
  }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
