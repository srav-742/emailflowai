import { io } from 'socket.io-client';

let socket = null;
let activeUserId = null;

/**
 * Get the Socket.IO server URL.
 * In dev: Vite proxies /socket.io → localhost:5050, so we connect to the Vite origin.
 * In prod: use VITE_SOCKET_URL or derive from VITE_API_URL.
 */
function getSocketUrl() {
  // Explicit override always wins
  const explicitSocketUrl = import.meta.env.VITE_SOCKET_URL;
  if (explicitSocketUrl) return explicitSocketUrl;

  const apiUrl = import.meta.env.VITE_API_URL;

  // If apiUrl is a full URL (e.g. https://api.mysite.com/api), use its origin
  if (apiUrl && /^https?:\/\//i.test(apiUrl)) {
    return new URL(apiUrl).origin;
  }

  // Connect directly to backend to avoid Vite proxy issues with WebSockets
  return 'http://localhost:5050';
}

export function connectSocket(userId) {
  const token = localStorage.getItem('token');
  if (!token || !userId) return null;

  // Reuse existing socket for same user
  if (socket && activeUserId === userId) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  // Disconnect old socket for different user
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  activeUserId = userId;

  socket = io(getSocketUrl(), {
    auth: { token },
    path: import.meta.env.VITE_SOCKET_PATH || '/socket.io',
    // Start with polling so Socket.IO can upgrade cleanly without noisy failed websocket handshakes.
    transports: ['polling', 'websocket'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: 8,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
    socket?.emit('join', userId);
  });

  socket.on('connect_error', (error) => {
    // Only log meaningful errors, skip noisy WebSocket-before-polling messages
    if (!error.message.includes('WebSocket is closed')) {
      console.warn('[Socket] Connection issue:', error.message);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
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
