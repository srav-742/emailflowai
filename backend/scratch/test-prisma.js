
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

async function testPrisma() {
  console.log('Testing Prisma connection with adapter...');
  
  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    console.log('Successfully connected using Prisma + Adapter');
    console.log('Result:', result);
  } catch (err) {
    console.error('Failed to connect using Prisma + Adapter:', err.message);
  } finally {
    await pool.end();
  }
}

testPrisma();
