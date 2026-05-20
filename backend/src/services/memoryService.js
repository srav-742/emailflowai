const crypto = require('crypto');
const prisma = require('../config/database');

let memoryTablesReady = false;

async function ensureMemoryTables() {
  memoryTablesReady = true;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

async function extractEntities(email) {
  const body = String(email.body || email.snippet || '');
  const subject = String(email.subject || '');

  const people = unique((body.match(/\b[A-Z][a-z]{2,}\b/g) || []).slice(0, 40));
  const projects = unique((subject.match(/\b[A-Z]{2,}[A-Za-z0-9_-]*\b/g) || []).slice(0, 20));
  const organizations = unique((body.match(/\b[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?\s(?:Inc|LLC|Ltd|Corp|Systems|Technologies)\b/g) || []).slice(0, 20));
  const dates = unique((body.match(/\b(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s\d{1,2})\b/gi) || []).slice(0, 20));

  return {
    people,
    projects,
    organizations,
    dates,
  };
}

async function upsertMemoryNode(userId, type, value) {
  const nodeName = String(value || '').trim();
  const nodeType = String(type || '').toLowerCase();
  
  if (!nodeName) return null;

  try {
    const node = await prisma.memoryNode.upsert({
      where: {
        userId_name_type: {
          userId,
          name: nodeName,
          type: nodeType,
        }
      },
      update: {},
      create: {
        id: crypto.randomUUID(),
        userId,
        name: nodeName,
        type: nodeType,
        metadata: {},
      }
    });

    return {
      id: node.id,
      type: node.type,
      value: node.name
    };
  } catch (error) {
    console.error('Error in upsertMemoryNode:', error.message);
    return null;
  }
}

async function createRelation(userId, sourceId, targetId, relationType) {
  const relType = String(relationType || '').toLowerCase();
  try {
    await prisma.memoryRelation.upsert({
      where: {
        userId_sourceId_targetId_type: {
          userId,
          sourceId,
          targetId,
          type: relType,
        }
      },
      update: {},
      create: {
        id: crypto.randomUUID(),
        userId,
        sourceId,
        targetId,
        type: relType,
      }
    });
  } catch (error) {
    console.error('Error in createRelation:', error.message);
  }
}

async function buildMemoryGraph(email) {
  await ensureMemoryTables();

  const userId = email.userId;
  const entities = await extractEntities(email);

  const emailNode = await upsertMemoryNode(userId, 'EMAIL', email.id);
  if (!emailNode) {
    return;
  }

  const linkedTypes = [
    { key: 'people', type: 'PERSON', relationType: 'MENTIONED_IN' },
    { key: 'projects', type: 'PROJECT', relationType: 'PROJECT_CONTEXT' },
    { key: 'organizations', type: 'ORG', relationType: 'ORG_CONTEXT' },
    { key: 'dates', type: 'DATE', relationType: 'TIMELINE_CONTEXT' },
  ];

  for (const config of linkedTypes) {
    for (const value of entities[config.key] || []) {
      // Keep sync stable even on noisy extraction.
      // eslint-disable-next-line no-await-in-loop
      const node = await upsertMemoryNode(userId, config.type, value);
      if (node) {
        // eslint-disable-next-line no-await-in-loop
        await createRelation(userId, node.id, emailNode.id, config.relationType);
      }
    }
  }

  console.log('[MemoryGraph] Processed email');
}

async function queryMemory(question, userId) {
  await ensureMemoryTables();

  const keywords = unique(
    String(question || '')
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ''))
      .filter((token) => token.length > 2)
  );

  const nodes = await prisma.memoryNode.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 300
  });

  const mapped = nodes.map(n => ({
    id: n.id,
    type: n.type,
    value: n.name,
    createdAt: n.createdAt
  }));

  if (!keywords.length) {
    return mapped;
  }

  return mapped.filter((row) => {
    const haystack = `${row.type} ${row.value}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

async function getMemoryGraphOverview(userId) {
  await ensureMemoryTables();

  const [nodeCounts, relationCounts] = await Promise.all([
    prisma.memoryNode.groupBy({
      by: ['type'],
      where: { userId },
      _count: { _all: true }
    }),
    prisma.memoryRelation.groupBy({
      by: ['type'],
      where: { userId },
      _count: { _all: true }
    })
  ]);

  return {
    nodesByType: nodeCounts.map(n => ({ type: n.type, count: n._count._all })),
    relationsByType: relationCounts.map(r => ({ relationType: r.type, count: r._count._all })),
  };
}

async function extractAndIndexEmailEntities(email) {
  return buildMemoryGraph(email);
}

async function queryMemoryGraph(userId, question) {
  await ensureMemoryTables();
  const nodes = await queryMemory(question, userId);
  
  const relations = await prisma.memoryRelation.findMany({
    where: { userId },
    include: {
      source: true,
      target: true
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const edges = relations.map(r => ({
    id: r.id,
    source: r.sourceId,
    target: r.targetId,
    type: r.type
  }));

  const summary = `Found ${nodes.length} relevant context entities and ${relations.length} relationships mapping your inbox connections.`;

  return {
    summary,
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.value,
      type: n.type.toLowerCase(),
      createdAt: n.createdAt
    })),
    edges
  };
}

module.exports = {
  buildMemoryGraph,
  extractEntities,
  getMemoryGraphOverview,
  queryMemory,
  extractAndIndexEmailEntities,
  queryMemoryGraph,
};
