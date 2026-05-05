import { useEffect, useRef } from 'react';

/**
 * Custom hook to listen for real-time Server-Sent Events.
 * @param {Function} onNewEmail - Callback for new emails.
 * @param {Function} onFollowUp - Callback for follow-up reminders.
 */
export function useSSE(onNewEmail, onFollowUp) {
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(1000); // Start with 1s delay

  const onNewEmailRef = useRef(onNewEmail);
  const onFollowUpRef = useRef(onFollowUp);

  // Update refs when functions change, but don't re-run the effect
  useEffect(() => {
    onNewEmailRef.current = onNewEmail;
    onFollowUpRef.current = onFollowUp;
  }, [onNewEmail, onFollowUp]);

  useEffect(() => {
    let es;

    const connect = () => {
      const token = localStorage.getItem('token');
      console.log('[SSE] Connecting...');
      es = new EventSource(`/api/sse?token=${token}`);

      es.onopen = () => {
        console.log('[SSE] Connection established');
        reconnectDelayRef.current = 1000; // Reset delay on success
      };

      es.addEventListener('new_email', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onNewEmailRef.current) onNewEmailRef.current(data);
        } catch (err) {
          console.error('[SSE] Failed to parse new_email data', err);
        }
      });

      es.addEventListener('follow_up', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onFollowUpRef.current) onFollowUpRef.current(data);
        } catch (err) {
          console.error('[SSE] Failed to parse follow_up data', err);
        }
      });

      es.onerror = (err) => {
        console.error('[SSE] Connection error, reconnecting...', err);
        es.close();
        
        // Exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000); // Max 30s
          connect();
        }, reconnectDelayRef.current);
      };
    };

    connect();

    return () => {
      if (es) es.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, []); // Run only once
}
