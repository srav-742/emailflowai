/*
// src/hooks/useSocket.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectSocket, disconnectSocket, getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export function useSocket() {
  const { isAuthenticated } = useAuthStore();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();

    socket.on('email:new', (thread) => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      qc.invalidateQueries({ queryKey: ['inbox-stats'] });
      toast(`📧 New email: ${thread.subject}`, { duration: 4000 });
    });

    socket.on('email:updated', ({ threadId }: { threadId: string }) => {
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
    });

    socket.on('ai:ready', ({ threadId, type, data }: { threadId: string; type: string; data: unknown }) => {
      qc.setQueryData([type, threadId], data);
    });

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, qc]);

  return { socket: getSocket() };
}
*/

export function useSocket() {
  return {
    isConnected: false,
    transport: 'mock-http',
  };
}
