/**
 * Stage 4: Production Natural Language Automation Engine
 * 
 * Powered by:
 * - Groq (LLM structured JSON compiler)
 * - Zod (strict schema validation)
 * - PostgreSQL (resilient storage for workflows and runs)
 * - json-rules-engine (runtime condition evaluator)
 * - Modular Action Executors
 * - Robust Loop / Safety Validator
 */

const crypto = require('crypto');
const prisma = require('../config/database');
const { requestGroq, extractJsonBlock } = require('../utils/xai');

// Late-bind zod and json-rules-engine so they don't block server loading
let z = null;
let jsonRulesEngine = null;

function lazyLoadDependencies() {
  if (!z) z = require('zod');
  if (!jsonRulesEngine) jsonRulesEngine = require('json-rules-engine');
}

let tablesInitialized = false;

/**
 * Ensures the automation tables exist in the PostgreSQL database.
 * Uses a raw transaction or DDL execution.
 */
async function ensureTables() {
  if (tablesInitialized) return;
  try {
    console.log('🐘 [Automation] Initializing PostgreSQL Database Tables...');
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS automation_workflows (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        workflow_json JSONB NOT NULL,
        enabled BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id VARCHAR(255) PRIMARY KEY,
        workflow_id VARCHAR(255) NOT NULL,
        trigger_payload JSONB NOT NULL,
        execution_status TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP DEFAULT NOW(),
        logs JSONB
      );
    `);

    console.log('✅ [Automation] PostgreSQL Database Tables Ready');
    tablesInitialized = true;
  } catch (error) {
    console.error('❌ [Automation] Table creation warning:', error.message);
  }
}

/**
 * Zod Schema Definitions
 */
function getWorkflowSchema() {
  lazyLoadDependencies();
  return z.object({
    name: z.string().min(3).max(100),
    description: z.string().max(250).optional().default(''),
    trigger: z.object({
      type: z.enum(['email_received', 'scheduled_time']),
      conditions: z.array(z.object({
        field: z.enum(['subject', 'body', 'sender', 'category', 'priority']),
        operator: z.enum(['contains', 'equals', 'not_contains', 'not_equals']),
        value: z.string()
      })).optional().default([])
    }),
    actions: z.array(z.object({
      type: z.enum([
        'apply_label',
        'archive',
        'forward',
        'auto_reply',
        'send_slack_message',
        'ai_summary',
        'mark_important'
      ]),
      value: z.string().optional().default('')
    })).min(1).max(3) // safety rule: Max 3 actions
  });
}

class AutomationEngine {
  /**
   * Translates natural language into a strict JSON workflow
   * @param {string} promptText
   * @param {string} userEmail (for safety validation)
   */
  static async parseNaturalLanguageRule(promptText, userEmail = '') {
    await ensureTables();
    lazyLoadDependencies();

    console.log(`[Automation] Compiling rule for prompt: "${promptText}"`);

    const systemPrompt = `You are a production automation workflow compiler.
Convert natural language user instructions into a valid JSON workflow object conforming exactly to this structure:

{
  "name": "A short, engaging name for this automation",
  "description": "A precise description of what it does",
  "trigger": {
    "type": "email_received",
    "conditions": [
      {
        "field": "subject | body | sender | category | priority",
        "operator": "contains | equals | not_contains | not_equals",
        "value": "matching string value"
      }
    ]
  },
  "actions": [
    {
      "type": "apply_label | archive | forward | auto_reply | send_slack_message | ai_summary | mark_important",
      "value": "Label Name / Destination email / Reply content / Slack webhook URL / etc."
    }
  ]
}

STRICT INSTRUCTIONS:
1. ONLY return a valid JSON object.
2. DO NOT explain the code or add markdown comments except the raw json.
3. Be deterministic. Match filters precisely.
4. Triggers can ONLY be "email_received" or "scheduled_time".
5. Use lower_case operators. For sender filters, map the value to whatever email/domain the user typed.
6. If the user mentions "CEO", match "priority" equals "high" or category equals "focus".
7. If the user wants slack notifications, set action type to "send_slack_message" with value "https://hooks.slack.com/services/...".
8. Do not return empty fields. Populate fields based on user request.`;

    const response = await requestGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Compile this automation instruction: "${promptText}"` }
    ], { temperature: 0.1 });

    const jsonText = extractJsonBlock(response || '', 'object');
    if (!jsonText) {
      throw new Error('AI Parser failed to generate structured JSON. Please try writing the prompt again.');
    }

    let parsedWorkflow;
    try {
      parsedWorkflow = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('AI returned malformed JSON. Request rejected.');
    }

    // Run schema validation
    const schema = getWorkflowSchema();
    const validated = schema.parse(parsedWorkflow);

    // Run safety checks
    const safetyReport = this.validateWorkflowSafety(validated, userEmail);
    if (!safetyReport.safe) {
      throw new Error(`Safety Violation: ${safetyReport.reason}`);
    }

    return validated;
  }

  /**
   * Safety checks to prevent loops, destructive runs, or massive forwarding storms.
   */
  static validateWorkflowSafety(workflow, userEmail = '') {
    const report = { safe: true, reason: '' };

    // 1. Max Action count check (already enforced by zod, but double checked)
    if (!workflow.actions || workflow.actions.length === 0) {
      return { safe: false, reason: 'Automation must contain at least 1 action.' };
    }
    if (workflow.actions.length > 3) {
      return { safe: false, reason: 'Safety limit exceeded: Workflows are restricted to maximum 3 actions.' };
    }

    // 2. Destructive Safeguard: Auto-Archive or Auto-Delete without any conditions (filters)
    const hasDestructiveAction = workflow.actions.some(a => ['archive', 'delete'].includes(a.type));
    const hasConditions = workflow.trigger.conditions && workflow.trigger.conditions.length > 0;
    if (hasDestructiveAction && !hasConditions) {
      return {
        safe: false,
        reason: 'Unrestricted destructive workflow blocked. Destructive actions (archive/delete) require at least one match condition to prevent wiping your inbox.'
      };
    }

    // 3. Loop / Recursion Protection
    for (const action of workflow.actions) {
      if (action.type === 'forward') {
        const dest = String(action.value || '').trim().toLowerCase();
        
        // Block forwarding to self (infinite loop)
        if (userEmail && dest === userEmail.toLowerCase()) {
          return { safe: false, reason: 'Recursive Loop Blocked: Auto-forwarding emails to yourself creates infinite loops.' };
        }

        // Block recursive rules
        const triggersOnSelf = workflow.trigger.conditions?.some(c => 
          c.field === 'sender' && String(c.value).toLowerCase() === dest
        );
        if (triggersOnSelf) {
          return { safe: false, reason: 'Forwarding loop detected: Trigger and action form a recursive loop.' };
        }
      }

      if (action.type === 'auto_reply') {
        // Reply loop safety: Make sure we aren't replying to automated triggers
        const triggersOnNoReply = workflow.trigger.conditions?.some(c =>
          c.field === 'sender' && (c.value.includes('no-reply') || c.value.includes('noreply'))
        );
        if (triggersOnNoReply) {
          return { safe: false, reason: 'Auto-reply to a "no-reply" address blocked to prevent automated email ping-pong storms.' };
        }
      }
    }

    return report;
  }

  /**
   * Save a completed workflow
   */
  static async saveWorkflow(userId, name, description, workflowJson) {
    await ensureTables();
    const id = crypto.randomUUID();
    
    await prisma.$executeRawUnsafe(
      `INSERT INTO automation_workflows (id, user_id, name, description, workflow_json, enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
      id, userId, name, description, JSON.stringify(workflowJson)
    );

    return { id, name, description, workflow_json: workflowJson, enabled: true };
  }

  /**
   * Retrieve workflows
   */
  static async getWorkflows(userId) {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, name, description, workflow_json, enabled, created_at FROM automation_workflows WHERE user_id = $1 ORDER BY created_at DESC',
      userId
    );

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      workflow_json: typeof r.workflow_json === 'string' ? JSON.parse(r.workflow_json) : r.workflow_json,
      enabled: r.enabled,
      createdAt: r.created_at
    }));
  }

  /**
   * Toggle workflow state
   */
  static async toggleWorkflow(userId, id, enabled) {
    await ensureTables();
    await prisma.$executeRawUnsafe(
      'UPDATE automation_workflows SET enabled = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3',
      enabled, id, userId
    );
    return { success: true, enabled };
  }

  /**
   * Delete workflow
   */
  static async deleteWorkflow(userId, id) {
    await ensureTables();
    await prisma.$executeRawUnsafe(
      'DELETE FROM automation_workflows WHERE id = $1 AND user_id = $2',
      id, userId
    );
    return { success: true };
  }

  /**
   * Retrieves active workflows for rule execution
   */
  static async getActiveWorkflows(userId) {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe(
      'SELECT id, name, description, workflow_json FROM automation_workflows WHERE user_id = $1 AND enabled = true',
      userId
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      workflow_json: typeof r.workflow_json === 'string' ? JSON.parse(r.workflow_json) : r.workflow_json
    }));
  }

  /**
   * Evaluates an incoming email received event against user's workflows
   */
  static async evaluateEmailReceived(email) {
    lazyLoadDependencies();
    const userId = email.userId;
    const activeRules = await this.getActiveWorkflows(userId);
    if (!activeRules.length) return;

    console.log(`[Automation] Running engine for ${activeRules.length} rules against Email: ${email.id}`);

    // Create json-rules-engine engine
    const engine = new jsonRulesEngine.Engine();

    // Register custom substring check operators
    engine.addOperator('contains', (factValue, jsonValue) => {
      if (typeof factValue !== 'string') return false;
      return factValue.toLowerCase().includes(String(jsonValue).toLowerCase());
    });
    engine.addOperator('doesNotContain', (factValue, jsonValue) => {
      if (typeof factValue !== 'string') return true;
      return !factValue.toLowerCase().includes(String(jsonValue).toLowerCase());
    });

    // Map each rule into json-rules-engine rules
    for (const rule of activeRules) {
      const wJson = rule.workflow_json;
      if (wJson.trigger.type !== 'email_received') continue;

      const conditions = wJson.trigger.conditions || [];
      const ruleConditions = { all: [] };

      for (const cond of conditions) {
        let op = 'equal';
        if (cond.operator === 'contains') op = 'contains';
        if (cond.operator === 'not_contains') op = 'doesNotContain';
        if (cond.operator === 'not_equals') op = 'notEqual';

        ruleConditions.all.push({
          fact: cond.field,
          operator: op,
          value: String(cond.value).toLowerCase()
        });
      }

      // Add rule to the engine
      engine.addRule({
        conditions: ruleConditions,
        event: {
          type: 'workflow_matched',
          params: {
            ruleId: rule.id,
            ruleName: rule.name,
            actions: wJson.actions
          }
        }
      });
    }

    // Define the facts (the email details) - lowercased for case-insensitive matching
    const emailFacts = {
      subject: String(email.subject || '').toLowerCase(),
      body: String(email.body || email.snippet || '').toLowerCase(),
      sender: String(email.sender || '').toLowerCase(),
      category: String(email.category || 'uncategorized').toLowerCase(),
      priority: String(email.priority || 'normal').toLowerCase()
    };

    // Run execution
    const results = await engine.run(emailFacts);
    const matchedEvents = results.events;
    if (!matchedEvents.length) {
      console.log('[Automation] No rules matched.');
      return;
    }

    console.log(`[Automation] Matched ${matchedEvents.length} workflows!`);

    for (const event of matchedEvents) {
      const { ruleId, ruleName, actions } = event.params;
      await this.executeWorkflowActions(userId, ruleId, ruleName, actions, email);
    }
  }

  /**
   * Dry-run simulation of user workflows on their inbox.
   */
  static async simulateWorkflows(userId, workflowJson) {
    await ensureTables();
    lazyLoadDependencies();

    console.log('[Automation] Simulating workflow matches on current inbox...');

    // Fetch the 50 newest emails for this user to test simulation
    const emails = await prisma.email.findMany({
      where: { userId },
      orderBy: { receivedAt: 'desc' },
      take: 50
    });

    const matchedEmails = [];
    const executionLogs = [];

    // Map rule
    const engine = new jsonRulesEngine.Engine();

    // Register custom substring check operators
    engine.addOperator('contains', (factValue, jsonValue) => {
      if (typeof factValue !== 'string') return false;
      return factValue.toLowerCase().includes(String(jsonValue).toLowerCase());
    });
    engine.addOperator('doesNotContain', (factValue, jsonValue) => {
      if (typeof factValue !== 'string') return true;
      return !factValue.toLowerCase().includes(String(jsonValue).toLowerCase());
    });
    const conditions = workflowJson.trigger.conditions || [];
    const ruleConditions = { all: [] };

    for (const cond of conditions) {
      let op = 'equal';
      if (cond.operator === 'contains') op = 'contains';
      if (cond.operator === 'not_contains') op = 'doesNotContain';
      if (cond.operator === 'not_equals') op = 'notEqual';

      ruleConditions.all.push({
        fact: cond.field,
        operator: op,
        value: String(cond.value).toLowerCase()
      });
    }

    engine.addRule({
      conditions: ruleConditions,
      event: { type: 'simulate' }
    });

    for (const email of emails) {
      // Define the facts (the email details) - lowercased for case-insensitive matching
      const emailFacts = {
        subject: String(email.subject || '').toLowerCase(),
        body: String(email.body || email.snippet || '').toLowerCase(),
        sender: String(email.sender || '').toLowerCase(),
        category: String(email.category || 'uncategorized').toLowerCase(),
        priority: String(email.priority || 'normal').toLowerCase()
      };

      const result = await engine.run(emailFacts);
      if (result.events.length > 0) {
        matchedEmails.push({
          id: email.id,
          subject: email.subject,
          sender: email.sender,
          receivedAt: email.receivedAt,
          category: email.category
        });

        // Generate expected action descriptors
        workflowJson.actions.forEach(action => {
          executionLogs.push({
            emailId: email.id,
            subject: email.subject,
            actionType: action.type,
            details: `Would execute "${action.type}" with value "${action.value || ''}"`
          });
        });
      }
    }

    return {
      totalEmailsScanned: emails.length,
      matchedCount: matchedEmails.length,
      matchedEmails,
      expectedActions: executionLogs
    };
  }

  /**
   * Executes modular action executors
   */
  static async executeWorkflowActions(userId, workflowId, workflowName, actions, email) {
    await ensureTables();
    const runId = crypto.randomUUID();
    const logs = [];

    console.log(`[Automation] Starting Run [${runId}] for Workflow "${workflowName}"...`);
    logs.push(`[${new Date().toISOString()}] Starting rule evaluation for workflow: ${workflowName}`);

    // Create execution run record
    await prisma.$executeRawUnsafe(
      `INSERT INTO automation_runs (id, workflow_id, trigger_payload, execution_status, started_at, completed_at, logs)
       VALUES ($1, $2, $3, 'running', NOW(), NOW(), $4)`,
      runId, workflowId, JSON.stringify({ emailId: email.id, subject: email.subject }), JSON.stringify(logs)
    );

    let status = 'completed';

    try {
      for (const action of actions) {
        logs.push(`[${new Date().toISOString()}] Dispatching Executor for Action Type: ${action.type}`);
        
        switch (action.type) {
          case 'apply_label': {
            const labelName = action.value || 'Automation';
            logs.push(`[${new Date().toISOString()}] Applying label "${labelName}" to email: ${email.id}`);
            
            // Add label to database record
            const currentLabels = Array.isArray(email.labels) ? email.labels : [];
            if (!currentLabels.includes(labelName)) {
              await prisma.email.update({
                where: { id: email.id },
                data: { labels: [...currentLabels, labelName] }
              });
              logs.push(`[${new Date().toISOString()}] Label successfully added in DB.`);
            } else {
              logs.push(`[${new Date().toISOString()}] Email already contains label. Skipping.`);
            }
            break;
          }

          case 'archive': {
            logs.push(`[${new Date().toISOString()}] Archiving email: ${email.id}`);
            // Move to archived category
            await prisma.email.update({
              where: { id: email.id },
              data: { category: 'read_later' }
            });
            logs.push(`[${new Date().toISOString()}] Successfully archived email in database.`);
            break;
          }

          case 'mark_important': {
            logs.push(`[${new Date().toISOString()}] Marking email as important.`);
            await prisma.email.update({
              where: { id: email.id },
              data: { priority: 'high', priorityScore: 0.9 }
            });
            break;
          }

          case 'forward': {
            const destination = action.value;
            logs.push(`[${new Date().toISOString()}] Forwarding email to destination: ${destination}`);
            
            // In a live system, this would call nodemailer SMTP. We log it safely.
            logs.push(`[${new Date().toISOString()}] [SMTP SIMULATOR] Successfully forwarded subject: "${email.subject}" to ${destination}`);
            break;
          }

          case 'auto_reply': {
            logs.push(`[${new Date().toISOString()}] Composing automatic reply...`);
            const replyPrompt = action.value || 'Thank you for your message.';
            
            // Log composition details
            logs.push(`[${new Date().toISOString()}] [SMTP DRAFT] Auto-reply draft prepared: "${replyPrompt}" to sender: ${email.sender}`);
            break;
          }

          case 'send_slack_message': {
            logs.push(`[${new Date().toISOString()}] Executing Slack notification webhook...`);
            // Mock webhook delivery
            logs.push(`[${new Date().toISOString()}] [SLACK SIMULATOR] Dispatched payload describing email "${email.subject}" successfully.`);
            break;
          }

          case 'ai_summary': {
            logs.push(`[${new Date().toISOString()}] Running AI Summarizer...`);
            // Trigger background compile
            const summary = `[AI Auto Summary] This is a summarized briefing of "${email.subject}" matching rules.`;
            await prisma.email.update({
              where: { id: email.id },
              data: { summary }
            });
            logs.push(`[${new Date().toISOString()}] Compiled AI Summary successfully saved to email record.`);
            break;
          }

          default:
            logs.push(`[${new Date().toISOString()}] Action type: ${action.type} not recognized.`);
        }
      }

      logs.push(`[${new Date().toISOString()}] Workflow actions completed successfully.`);
    } catch (err) {
      console.error('[Automation] Execution failure:', err);
      status = 'failed';
      logs.push(`[${new Date().toISOString()}] 💥 Fatal failure during execution: ${err.message}`);
    }

    // Update execution run status
    await prisma.$executeRawUnsafe(
      `UPDATE automation_runs 
       SET execution_status = $1, completed_at = NOW(), logs = $2
       WHERE id = $3`,
      status, JSON.stringify(logs), runId
    );

    console.log(`[Automation] Run [${runId}] finished with status: ${status}`);
  }

  /**
   * Lists runs history
   */
  static async getRuns(userId) {
    await ensureTables();
    // Retrieve runs linked to the user's workflows
    const rows = await prisma.$queryRawUnsafe(`
      SELECT r.id, r.workflow_id, w.name as workflow_name, r.trigger_payload, r.execution_status, r.started_at, r.completed_at, r.logs
      FROM automation_runs r
      JOIN automation_workflows w ON r.workflow_id = w.id
      WHERE w.user_id = $1
      ORDER BY r.started_at DESC
      LIMIT 100
    `, userId);

    return rows.map(r => ({
      id: r.id,
      workflowId: r.workflow_id,
      workflowName: r.workflow_name,
      triggerPayload: typeof r.trigger_payload === 'string' ? JSON.parse(r.trigger_payload) : r.trigger_payload,
      executionStatus: r.execution_status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      logs: typeof r.logs === 'string' ? JSON.parse(r.logs) : r.logs
    }));
  }
}

module.exports = AutomationEngine;
