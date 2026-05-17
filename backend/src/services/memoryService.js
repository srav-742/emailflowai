const crypto = require('crypto');
const prisma = require('../config/database');

let memoryTablesReady = false;

async function ensureMemoryTables() {
  if (memoryTablesReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS memory_nodes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS memory_nodes_user_type_value_idx
    ON memory_nodes(user_id, type, value);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS memory_relations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS memory_relations_user_id_idx
    ON memory_relations(user_id, relation_type, created_at DESC);
  `);

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
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO memory_nodes (id, user_id, type, value, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, type, value) DO NOTHING
    `,
    crypto.randomUUID(),
    userId,
    type,
    value
  );

  const rows = await prisma.$queryRawUnsafe(
    'SELECT id, type, value FROM memory_nodes WHERE user_id = $1 AND type = $2 AND value = $3 LIMIT 1',
    userId,
    type,
    value
  );

  return rows?.[0] || null;
}

async function createRelation(userId, sourceId, targetId, relationType) {
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO memory_relations (id, user_id, source_id, target_id, relation_type, created_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `,
    crypto.randomUUID(),
    userId,
    sourceId,
    targetId,
    relationType
  );
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

  const baseRows = await prisma.$queryRawUnsafe(
    `
      SELECT id, type, value, created_at AS "createdAt"
      FROM memory_nodes
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 300
    `,
    userId
  );

  if (!keywords.length) {
    return baseRows;
  }

  return baseRows.filter((row) => {
    const haystack = `${row.type} ${row.value}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

async function getMemoryGraphOverview(userId) {
  await ensureMemoryTables();

  const [counts, relations] = await Promise.all([
    prisma.$queryRawUnsafe(
      `
        SELECT type, COUNT(*)::int AS count
        FROM memory_nodes
        WHERE user_id = $1
        GROUP BY type
      `,
      userId
    ),
    prisma.$queryRawUnsafe(
      `
        SELECT relation_type AS "relationType", COUNT(*)::int AS count
        FROM memory_relations
        WHERE user_id = $1
        GROUP BY relation_type
      `,
      userId
    ),
  ]);

  return {
    nodesByType: counts,
    relationsByType: relations,
  };
}

module.exports = {
  buildMemoryGraph,
  extractEntities,
  getMemoryGraphOverview,
  queryMemory,
};
