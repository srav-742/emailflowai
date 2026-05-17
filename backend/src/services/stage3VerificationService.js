const prisma = require('../config/database');
const { getSemanticStatus } = require('./semanticSearchService');
const { getMemoryGraphOverview } = require('./memoryService');
const { listWorkflows } = require('./agentOrchestrator');

async function getStage3Verification(userId) {
  const startedAt = Date.now();

  const [semantic, memory, pendingWorkflows] = await Promise.all([
    getSemanticStatus(userId),
    getMemoryGraphOverview(userId),
    listWorkflows(userId, 'PENDING'),
  ]);

  const failedJobs = await prisma.failedJob.count().catch(() => 0);
  const runtimeMs = Date.now() - startedAt;

  return {
    verifiedAt: new Date().toISOString(),
    runtimeMs,
    systems: {
      embeddings: {
        ready: semantic.indexedEmails > 0,
        indexedEmails: semantic.indexedEmails,
        coverage: semantic.coverage,
        model: semantic.model,
      },
      semanticSearch: {
        ready: semantic.indexedEmails > 0,
        pendingEmails: semantic.pendingEmails,
      },
      memoryGraph: {
        ready: Array.isArray(memory.nodesByType) && memory.nodesByType.length > 0,
        nodesByType: memory.nodesByType,
        relationsByType: memory.relationsByType,
      },
      agentWorkflow: {
        ready: true,
        pendingApprovals: pendingWorkflows.length,
      },
      runtime: {
        failedJobs,
        degraded: failedJobs > 0,
      },
    },
  };
}

module.exports = { getStage3Verification };
