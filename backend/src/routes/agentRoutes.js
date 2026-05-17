/**
 * routes/agentRoutes.js — Proactive Autonomous Agent Workflow endpoints
 */

const express = require('express');
const { executeApprovedWorkflow, rejectWorkflow, scanEmailForAgentActions } = require('../services/agentOrchestrator');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const prisma = require('../config/database');

const router = express.Router();

// ─── LIST PENDING AGENT WORKFLOW ACTIONS ──────────────────────────────────
router.get('/workflows', authenticate, asyncHandler(async (req, res) => {
  const workflows = await prisma.agentWorkflowApproval.findMany({
    where: {
      userId: req.user.id
    },
    include: {
      email: true
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(workflows);
}));

// ─── APPROVE & TRIGGER WORKFLOW TOOLS ─────────────────────────────────────
router.post('/workflows/:id/approve', authenticate, asyncHandler(async (req, res) => {
  const result = await executeApprovedWorkflow(req.params.id);
  res.json(result);
}));

// ─── REJECT WORKFLOW PROPOSAL ─────────────────────────────────────────────
router.post('/workflows/:id/reject', authenticate, asyncHandler(async (req, res) => {
  const result = await rejectWorkflow(req.params.id);
  res.json(result);
}));

// ─── SIMULATE INBOUND EMAIL TRIGGER (SANDBOX TESTER) ──────────────────────
router.post('/simulate-trigger', authenticate, asyncHandler(async (req, res) => {
  const { type } = req.body;
  const userId = req.user.id;

  console.log(`🤖 [AgentSimulate] Generating sandboxed trigger simulation: "${type}"`);

  let mockSubject = '';
  let mockBody = '';
  let mockSnippet = '';

  if (type === 'meeting_request') {
    mockSubject = 'Sync regarding Stage 3 Launch';
    mockSnippet = 'Hey, can we hop on a quick 30-minute call next Monday to go over Stage 3 deliverables?';
    mockBody = `Hi there,\n\nI hope you're having a good week. Can we hop on a quick 30-minute Zoom call next Monday morning around 10:00 AM? I'd love to go over the final Stage 3 product launch items and align on our deliverables.\n\nLet me know what time slots work best for you!\n\nBest regards,\nSarah Connor\nProduct Director, Microsoft`;
  } else if (type === 'invoice_overdue') {
    mockSubject = 'CRITICAL: Unpaid Invoice #4839 - Stage 3 Redesign';
    mockSnippet = 'Urgent reminder that invoice #4839 is now 14 days overdue. Please process payment.';
    mockBody = `Hello,\n\nThis is an urgent payment notice regarding Invoice #4839 for the Stage 3 branding design. The outstanding balance of $1,250.00 is now 14 days overdue and needs immediate settlement.\n\nPlease process this wire payment by the end of this week to prevent account suspension.\n\nKind regards,\nBilling Support\nStripe Payments`;
  } else {
    // Incident
    mockSubject = 'ALERT: Production Deployment Failure - commit #83fae';
    mockSnippet = 'Vite frontend build failed on production node-3. Process exit code 1.';
    mockBody = `[System Monitor - Incident Alert]\n\nSeverity: HIGH\nService: emailflow-frontend\nEvent: Production Deployment Failed\nCommit: #83fae29\nLogs: npm ERR! vite build failed with exit code 1. Out of memory on docker node-3.\n\nActions required: Please review build logs and restart worker nodes immediately.`;
  }

  // Create a mock email record in the database
  const email = await prisma.email.create({
    data: {
      userId,
      messageId: `simulated-msg-${Date.now()}`,
      threadId: null,
      subject: mockSubject,
      sender: type === 'meeting_request' ? 'sarah.connor@microsoft.com' : type === 'invoice_overdue' ? 'billing@stripe.com' : 'alerts@github.com',
      senderName: type === 'meeting_request' ? 'Sarah Connor' : type === 'invoice_overdue' ? 'Stripe Billing' : 'GitHub Systems',
      snippet: mockSnippet,
      body: mockBody,
      category: type === 'meeting_request' ? 'meetings' : type === 'invoice_overdue' ? 'finance' : 'developer',
      priority: 'normal',
      actionRequired: true,
      receivedAt: new Date()
    }
  });

  // Run the agent orchestrator scanner on this mock email
  await scanEmailForAgentActions(email);

  res.json({
    message: `Trigger simulation successful! Created mock email and queued proposed workflow in your dashboard.`,
    emailId: email.id
  });
}));

module.exports = router;
