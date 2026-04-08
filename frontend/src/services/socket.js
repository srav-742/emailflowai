import { io } from 'socket.io-client';

let socket = null;
let activeUserId = null;

function getSocketUrl() {
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl) {
    return explicitSocketUrl;
  }

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    return new URL(apiUrl).origin;
  }

  return window.location.origin;
}

export function connectSocket(userId) {
  const token = localStorage.getItem('token');
  if (!token || !userId) {
    return null;
  }

  if (socket && activeUserId === userId) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  if (socket) {
    socket.disconnect();
  }

  activeUserId = userId;
  socket = io(getSocketUrl(), {
    auth: { token },
    path: import.meta.env.VITE_SOCKET_PATH || '/socket.io',
    transports: ['polling', 'websocket'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
    socket?.emit('join', userId);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    activeUserId = null;
  }
}

export function getSocket() {
  return socket;
}
