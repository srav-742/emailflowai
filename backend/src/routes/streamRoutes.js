const express = require('express');
const { verifyToken } = require('../utils/jwt');
const notificationEmitter = require('../utils/eventEmitter');

const router = express.Router();

/**
 * SSE Endpoint: /api/stream
 * 
 * Establishes a persistent Server-Sent Events connection for real-time 
 * email push notifications without Socket.IO overhead.
 */
router.get('/', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({ error: 'Token required for streaming' });
  }

  const decoded = verifyToken(token);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decoded.id;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  console.log(`[SSE] Connection established for user: ${userId}`);

  // Handler for new emails
  const onNewEmails = (data) => {
    if (data.userId === userId) {
      data.emails.forEach(email => {
        res.write(`data: ${JSON.stringify({ type: 'NEW_EMAIL', payload: email })}\n\n`);
      });
    }
  };

  // Listen for events
  notificationEmitter.on('new-emails', onNewEmails);

  // Send initial keep-alive
  res.write(': keep-alive\n\n');

  // Cleanup on close
  req.on('close', () => {
    console.log(`[SSE] Connection closed for user: ${userId}`);
    notificationEmitter.removeListener('new-emails', onNewEmails);
    res.end();
  });
});

module.exports = router;
