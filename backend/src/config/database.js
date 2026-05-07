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
  throw new Error('[DB] DATABASE_URL is missing');
}

if (!databaseHost) {
  throw new Error('[DB] DATABASE_URL is invalid or unparsable');
}

console.log(`[DB] Configured host: ${databaseHost}`);

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
  log: ['error'],
});

module.exports = prisma;
