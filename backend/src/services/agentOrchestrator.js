const crypto = require('crypto');
const prisma = require('../config/database');

let workflowTableReady = false;

async function ensureWorkflowTable() {
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
    const existing = await prisma.agentWorkflowApproval.findFirst({
      where: {
        userId: email.userId,
        triggerType: workflow.type,
        status: 'pending',
        emailId: email.id
      }
    });

    if (existing) {
      continue;
    }

    const workflowId = crypto.randomUUID();
    let title = '';
    if (workflow.type === 'MEETING_REPLY') {
      title = `Schedule meeting with ${email.senderName || email.sender || 'Sender'}`;
    } else if (workflow.type === 'PAYMENT_FOLLOWUP') {
      title = `Process invoice/payment from ${email.senderName || email.sender || 'Sender'}`;
    } else {
      title = `Escalate operational incident from ${email.senderName || email.sender || 'Sender'}`;
    }

    const approval = await prisma.agentWorkflowApproval.create({
      data: {
        id: workflowId,
        userId: email.userId,
        emailId: email.id,
        triggerType: workflow.type,
        title,
        description: workflow.explanation,
        status: 'pending',
        actionData: {
          emailId: email.id,
          subject: email.subject || null,
          sender: email.sender || null,
        }
      }
    });

    created.push({
      id: workflowId,
      type: workflow.type,
      status: 'PENDING',
      explanation: workflow.explanation,
      payload: {
        emailId: email.id,
        subject: email.subject || null,
        sender: email.sender || null,
      },
      title,
      triggerType: workflow.type,
      description: workflow.explanation
    });
  }

  if (created.length) {
    console.log('[Agent] Workflow created');
  }

  return created;
}

async function listWorkflows(userId, status = null) {
  await ensureWorkflowTable();

  const approvals = await prisma.agentWorkflowApproval.findMany({
    where: {
      userId,
      status: status ? status.toLowerCase() : undefined
    },
    orderBy: { createdAt: 'desc' },
    take: 150
  });

  return approvals.map((appr) => ({
    id: appr.id,
    type: appr.triggerType,
    status: appr.status.toUpperCase(),
    explanation: appr.description || '',
    payload: typeof appr.actionData === 'string' ? JSON.parse(appr.actionData) : appr.actionData,
    createdAt: appr.createdAt,
    title: appr.title,
    description: appr.description,
    triggerType: appr.triggerType,
    actionData: appr.actionData
  }));
}

async function updateWorkflowStatus(userId, workflowId, status) {
  await ensureWorkflowTable();

  const approval = await prisma.agentWorkflowApproval.update({
    where: {
      id: workflowId,
      userId
    },
    data: {
      status: status.toLowerCase()
    }
  });

  if (!approval) {
    const error = new Error('Workflow not found');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: approval.id,
    type: approval.triggerType,
    status: approval.status.toUpperCase(),
    explanation: approval.description || '',
    payload: typeof approval.actionData === 'string' ? JSON.parse(approval.actionData) : approval.actionData,
    createdAt: approval.createdAt,
    title: approval.title,
    description: approval.description,
    triggerType: approval.triggerType,
    actionData: approval.actionData
  };
}

async function scanEmailForAgentActions(email) {
  return detectWorkflow(email);
}

async function executeApprovedWorkflow(workflowId) {
  const approval = await prisma.agentWorkflowApproval.findUnique({
    where: { id: workflowId }
  });

  if (!approval) {
    throw new Error(`Workflow proposal not found for ID: ${workflowId}`);
  }

  await prisma.agentWorkflowApproval.update({
    where: { id: workflowId },
    data: { status: 'approved' }
  });

  await prisma.calendarEvent.create({
    data: {
      id: crypto.randomUUID(),
      userId: approval.userId,
      googleEventId: `mock-event-${Date.now()}`,
      calendarId: 'primary',
      title: approval.title,
      description: approval.description || 'Auto-created meeting from email flow',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
      linkedEmailId: approval.emailId
    }
  });

  await prisma.actionItem.create({
    data: {
      id: crypto.randomUUID(),
      userId: approval.userId,
      emailId: approval.emailId || crypto.randomUUID(),
      title: approval.title,
      description: approval.description || 'Action required from email',
      status: 'pending',
      priority: 'medium',
      extractedAt: new Date()
    }
  });

  return {
    success: true,
    message: `Workflow ${workflowId} approved and executed successfully.`
  };
}

module.exports = {
  detectWorkflow,
  listWorkflows,
  updateWorkflowStatus,
  scanEmailForAgentActions,
  executeApprovedWorkflow,
};
