const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { semanticSearch, searchEmails, indexUserEmails, getSemanticStatus } = require('../services/semanticSearchService');
const { queryMemory, getMemoryGraphOverview } = require('../services/memoryService');
const { getStage3Verification } = require('../services/stage3VerificationService');

const router = express.Router();

router.use(authenticate);

router.post('/semantic-search', asyncHandler(async (req, res) => {
  const { query = '', limit = 10 } = req.body || {};
  const scored = await semanticSearch(query, req.user.id, { limit });
  res.json(scored);
}));

router.get('/semantic/status', asyncHandler(async (req, res) => {
  const status = await getSemanticStatus(req.user.id);
  res.json(status);
}));

router.post('/semantic/index', asyncHandler(async (req, res) => {
  const status = await indexUserEmails(req.user.id, req.body || {});
  res.json({ success: true, status });
}));

router.post('/semantic/query', asyncHandler(async (req, res) => {
  const { query = '', limit = 10, category } = req.body || {};
  const result = await searchEmails(req.user.id, query, { limit, category });
  res.json(result);
}));

router.post('/memory/query', asyncHandler(async (req, res) => {
  const { question = '' } = req.body || {};
  const nodes = await queryMemory(question, req.user.id);
  res.json({ nodes });
}));

router.get('/memory/overview', asyncHandler(async (req, res) => {
  const overview = await getMemoryGraphOverview(req.user.id);
  res.json(overview);
}));

router.get('/stage3/verify', asyncHandler(async (req, res) => {
  const report = await getStage3Verification(req.user.id);
  res.json(report);
}));

module.exports = router;
