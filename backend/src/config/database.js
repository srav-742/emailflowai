const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

function getDatabaseHost(connectionString) {
  if (!connectionString) {
    return null;
  }

  try {
    const url = new URL(connectionString);
    return url.hostname || 'localhost';
  } catch (error) {
    return 'invalid-url';
  }
}

let databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  // Clean up the URL: remove quotes and whitespace that might be added by Render dashboard
  databaseUrl = databaseUrl.replace(/^["']|["']$/g, '').trim();
}

if (!databaseUrl) {
  console.error('❌ [DB] FATAL: DATABASE_URL is missing from environment variables!');
} else {
  const host = getDatabaseHost(databaseUrl);
  console.log(`🐘 [DB] Connecting to host: ${host}`);
}

// Create a connection pool with SSL configured for Render
// We use a pool to ensure we can handle multiple concurrent connections efficiently
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl && databaseUrl.includes('render.com') ? {
    rejectUnauthorized: false
  } : false,
  connectionTimeoutMillis: 5000, // 5 second timeout
});

pool.on('error', (err) => {
  console.error('💥 [DB] Unexpected error on idle client', err.message);
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

// Test connection immediately
prisma.$connect()
  .then(() => {
    console.log('✅ [DB] Prisma connected successfully');
  })
  .catch((err) => {
    console.error('❌ [DB] Prisma connection failed:', err.message);
    if (err.message.includes('denied access')) {
      console.error('👉 TIP: Check if your database user has access to the specified database name.');
    }
  });

module.exports = prisma;

