const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { listWorkflows, updateWorkflowStatus } = require('../services/agentOrchestrator');

const router = express.Router();

router.use(authenticate);

router.get('/workflows', asyncHandler(async (req, res) => {
  const status = req.query.status || null;
  const workflows = await listWorkflows(req.user.id, status);
  res.json({ workflows });
}));

router.post('/workflows/:id/approve', asyncHandler(async (req, res) => {
  const workflow = await updateWorkflowStatus(req.user.id, req.params.id, 'APPROVED');
  res.json(workflow);
}));

router.post('/workflows/:id/reject', asyncHandler(async (req, res) => {
  const workflow = await updateWorkflowStatus(req.user.id, req.params.id, 'REJECTED');
  res.json(workflow);
}));

module.exports = router;
