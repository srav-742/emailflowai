const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');

const clients = new Map();

/**
 * SSE Endpoint: /api/sse
 * Established a persistent connection for real-time notifications.
 */
router.get('/', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx
  res.flushHeaders();

  const userId = req.user.id;
  
  // Set initial keep-alive
  res.write(': keep-alive\n\n');

  // Add client to active pool
  clients.set(userId, res);

  console.log(`[SSE] User ${userId} connected`);

  req.on('close', () => {
    console.log(`[SSE] User ${userId} disconnected`);
    clients.delete(userId);
  });
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
