const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const clients = new Map();

const jwt = require('jsonwebtoken');

/**
 * SSE Endpoint: /api/sse
 * Established a persistent connection for real-time notifications.
 */
router.get('/', async (req, res) => {
  const token = req.query.token;
  
  if (!token) {
    console.error('[SSE] Unauthorized: No token provided in query');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); 
    res.flushHeaders();

    const userId = decoded.id;
    
    // Set initial keep-alive
    res.write(': keep-alive\n\n');
    res.write(`data: Connected\n\n`);

    // Add client to active pool
    clients.set(userId, res);

    console.log(`[SSE] User ${userId} connected successfully via query token`);

    req.on('close', () => {
      console.log(`[SSE] User ${userId} disconnected`);
      clients.delete(userId);
    });
  } catch (err) {
    console.error('[SSE] Unauthorized: Invalid or expired token', err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

/**
 * Broadcast helper to push events to specific users
 */
function pushEvent(userId, event, data) {
  const res = clients.get(userId);
  if (res) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  }
  return false;
}

module.exports = {
  router,
  pushEvent
};
