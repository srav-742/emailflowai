/**
 * routes/memoryRoutes.js — AI Relationship Memory Graph endpoints
 */

const express = require('express');
const { queryMemoryGraph, extractAndIndexEmailEntities } = require('../services/memoryService');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const prisma = require('../config/database');

const router = express.Router();

// ─── QUERY RELATION NETWORK ───────────────────────────────────────────────
router.post('/query', authenticate, asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required.' });
  }

  const result = await queryMemoryGraph(req.user.id, query);
  res.json(result);
}));

// ─── FETCH GRAPH METRICS & KEY ENTITIES ────────────────────────────────────
router.get('/entities', authenticate, asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // 1. Fetch counts
  const nodeCount = await prisma.memoryNode.count({ where: { userId } });
  const edgeCount = await prisma.memoryRelation.count({ where: { userId } });

  // 2. Fetch recent entities group by type
  const nodes = await prisma.memoryNode.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  // 3. Fetch recent relationships
  const relations = await prisma.memoryRelation.findMany({
    where: { userId },
    include: {
      source: true,
      target: true
    },
    orderBy: { createdAt: 'desc' },
    take: 15
  });

  res.json({
    metrics: {
      totalEntities: nodeCount,
      totalRelationships: edgeCount,
      peopleCount: nodes.filter(n => n.type === 'person').length,
      companiesCount: nodes.filter(n => n.type === 'company').length,
      commitmentsCount: nodes.filter(n => n.type === 'commitment').length
    },
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.name,
      type: n.type,
      description: n.metadata?.description || 'Extracted business context'
    })),
    relations: relations.map(r => ({
      id: r.id,
      source: r.source.name,
      sourceType: r.source.type,
      target: r.target.name,
      targetType: r.target.type,
      type: r.type,
      timestamp: r.createdAt
    }))
  });
}));

// ─── EXTRACT GRAPH FROM RECENT EMAILS (ON-DEMAND) ──────────────────────────
router.post('/extract-all', authenticate, asyncHandler(async (req, res) => {
  console.log(`⚡ [MemoryGraph] Starting relationship graph extraction for user ${req.user.id}`);

  // Fetch recent emails that don't have graph associations yet (we can fetch top 20 active emails)
  const emailsToExtract = await prisma.email.findMany({
    where: {
      userId: req.user.id
    },
    orderBy: { receivedAt: 'desc' },
    take: 20
  });

  if (emailsToExtract.length === 0) {
    return res.json({ message: 'No emails found in this account to extract memory relations.', extractedCount: 0 });
  }

  let successCount = 0;
  for (const email of emailsToExtract) {
    try {
      await extractAndIndexEmailEntities(email);
      successCount++;
    } catch (err) {
      console.error(`⚠️ Graph extraction failed for email ${email.id}:`, err.message);
    }
  }

  res.json({
    message: `Graph learning completed successfully! Synced connections across ${successCount} recent emails.`,
    extractedCount: successCount
  });
}));

module.exports = router;
