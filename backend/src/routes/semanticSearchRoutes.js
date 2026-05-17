/**
 * routes/semanticSearchRoutes.js — Semantic AI Search endpoints
 */

const express = require('express');
const { searchSemantically, indexEmail } = require('../services/semanticSearchService');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const prisma = require('../config/database');

const router = express.Router();

// ─── SEMANTIC CONTEXT QUERY ───────────────────────────────────────────────
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { query, limit } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required.' });
  }

  const result = await searchSemantically(req.user.id, query, limit || 6);
  res.json(result);
}));

// ─── INDEX ENTIRE WORKSPACE (ON-DEMAND) ────────────────────────────────────
router.post('/index-all', authenticate, asyncHandler(async (req, res) => {
  console.log(`⚡ [SemanticSearch] Starting full inbox indexing for user ${req.user.id}`);
  
  // Find emails that do not have a SemanticEmailIndex yet
  const emailsToIndex = await prisma.email.findMany({
    where: {
      userId: req.user.id,
      semanticIndex: null
    },
    take: 40 // Limit batch size for safety & rate limits
  });

  if (emailsToIndex.length === 0) {
    return res.json({ message: 'All email communications are already indexed and search-ready!', indexedCount: 0 });
  }

  // Run embedding indexing in background to avoid blocking response
  let indexCount = 0;
  for (const email of emailsToIndex) {
    try {
      await indexEmail(email);
      indexCount++;
    } catch (err) {
      console.error(`⚠️ Failed to index email ${email.id}:`, err.message);
    }
  }

  res.json({
    message: `Successfully indexed ${indexCount} emails semantically!`,
    indexedCount: indexCount
  });
}));

module.exports = router;
