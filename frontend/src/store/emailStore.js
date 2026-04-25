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

  setEmails: (emails) => set({ emails }),

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
