// src/sockets/socketHandler.ts
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

export function initSocketHandlers(io: Server): void {
  // Authenticate socket connections
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    logger.info(`Socket connected: user ${userId}`);

    // Join user's private room
    socket.join(`user:${userId}`);

    socket.on('subscribe:inbox', () => {
      socket.join(`inbox:${userId}`);
      logger.debug(`User ${userId} subscribed to inbox`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: user ${userId}`);
    });
  });
}

// Emit helpers — call these from services/controllers
export function emitNewEmail(io: Server, userId: string, thread: object): void {
  io.to(`user:${userId}`).emit('email:new', thread);
}

export function emitEmailUpdate(io: Server, userId: string, threadId: string, update: object): void {
  io.to(`user:${userId}`).emit('email:updated', { threadId, ...update });
}

export function emitAiReady(io: Server, userId: string, threadId: string, type: string, data: object): void {
  io.to(`user:${userId}`).emit('ai:ready', { threadId, type, data });
}