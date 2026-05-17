const crypto = require('crypto');
const prisma = require('../config/database');
const { cosineSimilarity } = require('../utils/cosineSimilarity');

const VECTOR_LENGTH = 384;
let embeddingTableReady = false;

async function ensureEmbeddingTable() {
  if (embeddingTableReady) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS email_embeddings (
      id TEXT PRIMARY KEY,
      email_id TEXT NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE ON UPDATE CASCADE,
      subject_vector JSONB NOT NULL,
      body_vector JSONB NOT NULL,
      thread_vector JSONB NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS email_embeddings_email_id_idx
    ON email_embeddings(email_id);
  `);

  embeddingTableReady = true;
}

function createDeterministicSeed(text = '') {
  const digest = crypto.createHash('sha256').update(String(text)).digest();
  return digest.readUInt32BE(0);
}

function seededRandom(seedValue) {
  let seed = seedValue >>> 0;
  return () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967295);
  };
}

async function generateEmbedding(text) {
  const rand = seededRandom(createDeterministicSeed(text));
  return Array.from({ length: VECTOR_LENGTH }, () => Number(rand().toFixed(6)));
}

async function indexEmail(email) {
  await ensureEmbeddingTable();

  const subjectVector = await generateEmbedding(email.subject || '');
  const bodyVector = await generateEmbedding(email.body || email.snippet || '');
  const threadVector = await generateEmbedding(`${email.threadId || ''} ${email.body || email.snippet || ''}`);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO email_embeddings (
        id, email_id, subject_vector, body_vector, thread_vector, created_at
      ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (email_id) DO UPDATE SET
        subject_vector = EXCLUDED.subject_vector,
        body_vector = EXCLUDED.body_vector,
        thread_vector = EXCLUDED.thread_vector,
        created_at = CURRENT_TIMESTAMP
    `,
    crypto.randomUUID(),
    email.id,
    JSON.stringify(subjectVector),
    JSON.stringify(bodyVector),
    JSON.stringify(threadVector)
  );

  console.log('[SemanticSearch] Indexed:', email.subject || 'No subject');

  return {
    emailId: email.id,
    subjectVector,
    bodyVector,
    threadVector,
  };
}

async function indexUserEmails(userId, options = {}) {
  await ensureEmbeddingTable();

  const limit = Math.min(Number(options.limit) || 250, 2000);
  const emails = await prisma.email.findMany({
    where: { userId },
    orderBy: { receivedAt: 'desc' },
    take: limit,
  });

  let indexedCount = 0;
  for (const email of emails) {
    // Keep throughput stable; async queue migration can come later.
    // eslint-disable-next-line no-await-in-loop
    await indexEmail(email);
    indexedCount += 1;
  }

  return getSemanticStatus(userId, {
    indexedThisRun: indexedCount,
  });
}

function applyQueryFilters(email, query) {
  const normalized = String(query || '').toLowerCase();

  if (normalized.includes('last month')) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const receivedAt = new Date(email.receivedAt);
    if (receivedAt < from || receivedAt > to) {
      return false;
    }
  }

  if (normalized.includes('next week')) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() + (7 - now.getDay()));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const receivedAt = new Date(email.receivedAt);
    if (receivedAt < start || receivedAt > end) {
      return false;
    }
  }

  if (/unhappy|frustrated|angry|issue|problem|risk/i.test(normalized)) {
    const text = `${email.subject || ''} ${email.body || ''} ${email.snippet || ''}`.toLowerCase();
    if (!/unhappy|frustrated|angry|issue|problem|risk|blocked|delay/.test(text)) {
      return false;
    }
  }

  const fromMatch = normalized.match(/\bfrom\s+([a-z0-9@.\-_]+)/i);
  if (fromMatch) {
    const senderNeedle = fromMatch[1].toLowerCase();
    const senderText = `${email.sender || ''} ${email.senderName || ''}`.toLowerCase();
    if (!senderText.includes(senderNeedle)) {
      return false;
    }
  }

  const amountMatch = normalized.match(/\$([0-9]+(?:\.[0-9]+)?)/i);
  if (amountMatch) {
    const threshold = Number(amountMatch[1]);
    const content = `${email.subject || ''} ${email.body || ''} ${email.snippet || ''}`;
    const amountPattern = /\$([0-9]+(?:\.[0-9]+)?)/g;
    const amounts = [];
    let match = amountPattern.exec(content);
    while (match) {
      amounts.push(Number(match[1]));
      match = amountPattern.exec(content);
    }
    if (!amounts.some((value) => value >= threshold)) {
      return false;
    }
  }

  return true;
}

function toArray(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
}

function buildSemanticSummary(query, matches) {
  if (!matches.length) {
    return `No relevant emails found for "${query}". Try syncing and indexing more messages.`;
  }

  const topSubjects = matches.slice(0, 3).map((entry) => entry.email.subject || 'Untitled thread');
  return `Found ${matches.length} relevant emails for "${query}". Top threads: ${topSubjects.join(' | ')}.`;
}

async function semanticSearch(query, userId, options = {}) {
  await ensureEmbeddingTable();

  const queryVector = await generateEmbedding(query);
  const limit = Math.min(Number(options.limit) || 10, 25);

  const rows = await prisma.$queryRawUnsafe(
    `
      SELECT
        ee.body_vector AS "bodyVector",
        e.id,
        e.subject,
        e.body,
        e.snippet,
        e.sender,
        e.sender_name AS "senderName",
        e.category,
        e.priority,
        e.received_at AS "receivedAt",
        e.action_required AS "actionRequired"
      FROM email_embeddings ee
      INNER JOIN emails e ON e.id = ee.email_id
      WHERE e.user_id = $1
    `,
    userId
  );

  const scored = rows
    .filter((row) => applyQueryFilters(row, query))
    .map((row) => ({
      email: row,
      score: Number(cosineSimilarity(queryVector, toArray(row.bodyVector)).toFixed(4)),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return scored;
}

async function searchEmails(userId, query, options = {}) {
  const scored = await semanticSearch(query, userId, options);
  return {
    query,
    summary: buildSemanticSummary(query, scored),
    matches: scored.map((entry) => ({
      ...entry.email,
      similarity: entry.score,
    })),
  };
}

async function getSemanticStatus(userId, extras = {}) {
  await ensureEmbeddingTable();

  const [emailCount, embeddingRows, latestRows] = await Promise.all([
    prisma.email.count({ where: { userId } }),
    prisma.$queryRawUnsafe(
      'SELECT COUNT(*)::int AS count FROM email_embeddings ee INNER JOIN emails e ON e.id = ee.email_id WHERE e.user_id = $1',
      userId
    ),
    prisma.$queryRawUnsafe(
      `
        SELECT ee.created_at AS "createdAt"
        FROM email_embeddings ee
        INNER JOIN emails e ON e.id = ee.email_id
        WHERE e.user_id = $1
        ORDER BY ee.created_at DESC
        LIMIT 1
      `,
      userId
    ),
  ]);

  const indexedEmails = Number(embeddingRows?.[0]?.count || 0);
  const coverage = emailCount ? Number(((indexedEmails / emailCount) * 100).toFixed(1)) : 0;

  return {
    totalEmails: emailCount,
    indexedEmails,
    pendingEmails: Math.max(emailCount - indexedEmails, 0),
    coverage,
    lastIndexedAt: latestRows?.[0]?.createdAt || null,
    model: `mock-${VECTOR_LENGTH}`,
    provider: 'mock-embedding',
    indexedThisRun: extras.indexedThisRun || 0,
  };
}

module.exports = {
  generateEmbedding,
  indexEmail,
  indexUserEmails,
  semanticSearch,
  searchEmails,
  getSemanticStatus,
  VECTOR_LENGTH,
};
