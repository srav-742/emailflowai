import { useEffect } from 'react';
import { useEmailStore } from '../store/emailStore';

/**
 * useSSE
 * 
 * Subscribes to the backend SSE stream for real-time email notifications.
 * Automatically updates the email store when a 'NEW_EMAIL' event is received.
 */
export function useSSE(token) {
  const addEmail = useEmailStore((state) => state.addEmail);

  useEffect(() => {
    if (!token) return;

    // Connect to the SSE endpoint
    const streamUrl = `/api/stream?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(streamUrl);

    console.log('[SSE] Connecting to stream...');

    eventSource.onopen = () => {
      console.log('[SSE] Connection active');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE] Received event:', data.type);

        if (data.type === 'NEW_EMAIL') {
          addEmail(data.payload);
        }
      } catch (error) {
        console.error('[SSE] Failed to parse event data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[SSE] Stream error:', error);
      eventSource.close();
    };

    return () => {
      console.log('[SSE] Closing connection');
      eventSource.close();
    };
  }, [token, addEmail]);
}
