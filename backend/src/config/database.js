const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

function getDatabaseHost(connectionString) {
  if (!connectionString) {
    return null;
  }

  try {
    return new URL(connectionString).hostname || null;
  } catch (error) {
    return null;
  }
}

const databaseUrl = process.env.DATABASE_URL;
const databaseHost = getDatabaseHost(databaseUrl);

if (!databaseUrl) {
  console.error('[DB] DATABASE_URL is missing');
} else {
  console.log(`[DB] Configured host: ${databaseHost || 'unparseable DATABASE_URL'}`);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    databaseUrl &&
    !databaseUrl.includes('localhost') &&
    databaseUrl.includes('.')
      ? { rejectUnauthorized: false }
      : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[DB ERROR] Unexpected error on idle client:', err.message);
});

pool.on('connect', () => {
  console.log(`[DB] Pool connected to ${databaseHost || 'unknown host'}`);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error'] });

module.exports = prisma;
