const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const emailRoutes = require('./routes/emailRoutes');
const aiRoutes = require('./routes/aiRoutes');
const prisma = require('./config/database');
const { verifyToken } = require('./utils/jwt');
const { getUserSocketRoom } = require('./utils/socketRooms');
const { startEmailPolling } = require('./services/emailSyncService');
const redis = require('./redisClient');


const app = express();
const PORT = process.env.PORT || 5050;

const server = http.createServer(app);
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:3000',
].filter(Boolean);

function buildApiIndex() {
  return {
    message: 'EmailFlow AI backend is running',
    frontend: process.env.FRONTEND_URL || 'http://localhost:5173',
    health: '/api/health',
    routes: {
      auth: ['/api/auth/firebase-login', '/api/auth/profile', '/auth/google/url', '/auth/gmail/url'],
      emails: ['/api/emails', '/api/emails/sync', '/api/emails/stats'],
      ai: ['/api/ai/morning-brief', '/api/ai/analytics'],
    },
  };
}

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

// Authenticate the socket once so each connection can safely join its own user room.
io.use(async (socket, next) => {
  try {
    const rawToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = String(rawToken || '').replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const decoded = verifyToken(token);
    if (!decoded?.id) {
      return next(new Error('Invalid or expired token'));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return next(new Error('User not found'));
    }

    socket.data.user = user;
    return next();
  } catch (error) {
    return next(new Error('Socket authentication failed'));
  }
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security headers — use unsafe-none for COOP to allow Google OAuth popup communication
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json(buildApiIndex());
});

app.get('/api', (req, res) => {
  res.json(buildApiIndex());
});

// Chrome DevTools sometimes probes this path on localhost. Returning 204 avoids noisy backend 404s.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', async (req, res) => {
  let database = 'disconnected';
  let redisStatus = 'disconnected';

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    database = 'connected';
  } catch (error) {
    database = 'error';
  }

  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (error) {
    redisStatus = 'error';
  }

  res.json({
    status: (database === 'connected' && redisStatus === 'connected') ? 'ok' : 'degraded',
    database,
    redis: redisStatus,
    firebaseProject: process.env.FIREBASE_PROJECT_ID || null,
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res, next) => {
  if (res.headersSent) {
    return next();
  }

  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl,
    });
  }

  return res.status(404).json({
    error: 'Not found',
    path: req.originalUrl,
    message: 'This server exposes an API. Open the frontend at http://localhost:5173.',
  });
});

// Socket.IO connection
io.on('connection', (socket) => {
  const user = socket.data.user;
  socket.join(getUserSocketRoom(user.id));
  console.log(`Client connected: ${socket.id} (user: ${user.id})`);

  socket.on('join', (requestedUserId) => {
    if (String(requestedUserId) !== user.id) {
      socket.emit('socket:error', { message: 'Room join denied' });
      return;
    }

    socket.join(getUserSocketRoom(user.id));
    socket.emit('joined', { room: getUserSocketRoom(user.id) });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('sync_emails', () => {
    io.to(getUserSocketRoom(user.id)).emit('emails_synced', { message: 'Emails have been synced' });
  });
});

// Make io accessible to routes
app.set('io', io);

startEmailPolling(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 Groq AI: ${process.env.GROQ_API_KEY ? '✅ Key loaded (' + process.env.GROQ_MODEL + ')' : '❌ GROQ_API_KEY not set!'}`);
});

module.exports = { app, io };
