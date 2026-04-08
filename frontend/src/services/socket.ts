/*
// src/services/socket.ts
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  const token = useAuthStore.getState().accessToken;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket?.id);
    socket?.emit('subscribe:inbox');
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
*/

export function connectSocket() {
  return null;
}

export function disconnectSocket() {
  return undefined;
}

export function getSocket() {
  return null;
}
