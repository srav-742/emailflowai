/**
 * Automation Routes — Stage 4
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const AutomationEngine = require('../services/stage4_automationEngine');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Get active workflows for user
router.get('/list', authenticate, asyncHandler(async (req, res) => {
  const workflows = await AutomationEngine.getWorkflows(req.user.id);
  res.json({ success: true, workflows });
}));

// Compile prompt and save workflow
router.post('/create', authenticate, asyncHandler(async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  try {
    const compiled = await AutomationEngine.parseNaturalLanguageRule(prompt, req.user.email);
    
    // Save to the database
    const saved = await AutomationEngine.saveWorkflow(
      req.user.id,
      compiled.name,
      compiled.description,
      compiled
    );

    res.json({ success: true, workflow: saved });
  } catch (error) {
    console.error('[Automation] Compiler Route Error:', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
}));

// Test/Simulate workflow against target inbox emails
router.post('/test', authenticate, asyncHandler(async (req, res) => {
  const { workflowJson } = req.body;
  if (!workflowJson) {
    return res.status(400).json({ success: false, error: 'Workflow configuration is required for simulation.' });
  }

  try {
    const report = await AutomationEngine.simulateWorkflows(req.user.id, workflowJson);
    res.json({ success: true, simulation: report });
  } catch (error) {
    console.error('[Automation] Simulator Route Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}));

// Toggle rule state (enable/disable)
router.post('/toggle', authenticate, asyncHandler(async (req, res) => {
  const { id, enabled } = req.body;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Workflow ID is required' });
  }

  const result = await AutomationEngine.toggleWorkflow(req.user.id, id, enabled);
  res.json({ success: true, enabled: result.enabled });
}));

// Delete rule
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  await AutomationEngine.deleteWorkflow(req.user.id, id);
  res.json({ success: true, message: 'Workflow deleted' });
}));

// Get executions log
router.get('/runs', authenticate, asyncHandler(async (req, res) => {
  const runs = await AutomationEngine.getRuns(req.user.id);
  res.json({ success: true, runs });
}));

module.exports = router;
