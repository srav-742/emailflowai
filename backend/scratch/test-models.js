
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

async function testPrismaModels() {
  console.log('Testing Prisma models...');
  
  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);
    
    const users = await prisma.user.findMany({ take: 1 });
    console.log('First user:', users[0] ? users[0].email : 'No users found');
  } catch (err) {
    console.error('Failed to query users:', err.message);
  } finally {
    await pool.end();
  }
}

testPrismaModels();
