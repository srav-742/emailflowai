const crypto = require('crypto');
const prisma = require('../config/database');

let workflowTableReady = false;

async function ensureWorkflowTable() {
  if (workflowTableReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS agent_workflow_approvals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      explanation TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS agent_workflow_approvals_user_status_idx
    ON agent_workflow_approvals(user_id, status, created_at DESC);
  `);

  workflowTableReady = true;
}

function buildWorkflowCandidates(email) {
  const subject = String(email.subject || '').toLowerCase();
  const body = String(email.body || email.snippet || '').toLowerCase();
  const text = `${subject} ${body}`;
  const workflows = [];

  if (text.includes('meeting') || text.includes('schedule') || text.includes('availability')) {
    workflows.push({
      type: 'MEETING_REPLY',
      explanation: 'Meeting request detected',
    });
  }

  if (text.includes('invoice') || text.includes('payment') || text.includes('overdue')) {
    workflows.push({
      type: 'PAYMENT_FOLLOWUP',
      explanation: 'Invoice or payment follow-up detected',
    });
  }

  if (text.includes('deploy failed') || text.includes('incident') || text.includes('outage')) {
    workflows.push({
      type: 'INCIDENT_ESCALATION',
      explanation: 'Operational risk trigger detected',
    });
  }

  return workflows;
}

async function detectWorkflow(email) {
  await ensureWorkflowTable();

  const workflows = buildWorkflowCandidates(email);
  if (!workflows.length) {
    return [];
  }

  const created = [];
  for (const workflow of workflows) {
    const duplicateRows = await prisma.$queryRawUnsafe(
      `
        SELECT id
        FROM agent_workflow_approvals
        WHERE user_id = $1
          AND type = $2
          AND status = 'PENDING'
          AND payload->>'emailId' = $3
        LIMIT 1
      `,
      email.userId,
      workflow.type,
      email.id
    );

    if (duplicateRows.length) {
      continue;
    }

    // Keep default behavior approval-first and fully auditable.
    const workflowId = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `
        INSERT INTO agent_workflow_approvals (
          id, user_id, type, status, explanation, payload, created_at
        ) VALUES ($1, $2, $3, 'PENDING', $4, $5::jsonb, CURRENT_TIMESTAMP)
      `,
      workflowId,
      email.userId,
      workflow.type,
      workflow.explanation,
      JSON.stringify({
        emailId: email.id,
        subject: email.subject || null,
        sender: email.sender || null,
      })
    );

    created.push({
      id: workflowId,
      type: workflow.type,
      status: 'PENDING',
      explanation: workflow.explanation,
      payload: {
        emailId: email.id,
      },
    });
  }

  if (created.length) {
    console.log('[Agent] Workflow created');
  }

  return created;
}

async function listWorkflows(userId, status = null) {
  await ensureWorkflowTable();

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT id, type, status, explanation, payload, created_at AS "createdAt"
      FROM agent_workflow_approvals
      WHERE user_id = $1
        AND ($2::text IS NULL OR status = $2::text)
      ORDER BY created_at DESC
      LIMIT 150
    `,
    userId,
    status || null
  );

  return rows.map((row) => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  }));
}

async function updateWorkflowStatus(userId, workflowId, status) {
  await ensureWorkflowTable();

  const rows = await prisma.$queryRawUnsafe(
    `
      UPDATE agent_workflow_approvals
      SET status = $1
      WHERE id = $2
        AND user_id = $3
      RETURNING id, type, status, explanation, payload, created_at AS "createdAt"
    `,
    status,
    workflowId,
    userId
  );

  const row = rows?.[0] || null;
  if (!row) {
    const error = new Error('Workflow not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  };
}

module.exports = {
  detectWorkflow,
  listWorkflows,
  updateWorkflowStatus,
};
