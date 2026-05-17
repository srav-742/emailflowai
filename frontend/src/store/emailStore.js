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
    // If it's a function, call it with current state to get the new list.
    // If it's an array, use it directly.
    const nextEmails = typeof newEmails === 'function' ? newEmails(state.emails) : newEmails;
    
    if (!Array.isArray(nextEmails)) {
      console.warn('[EmailStore] setEmails received non-array data:', nextEmails);
      return state;
    }

    // Deduplicate by ID
    const merged = new Map();
    nextEmails.forEach((email) => {
      if (email && email.id) {
        merged.set(email.id, email);
      }
    });
    
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
