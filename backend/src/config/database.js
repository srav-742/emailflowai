const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') 
    ? { rejectUnauthorized: false } 
    : false
});

pool.on('error', (err) => {
  console.error('🚨 [DB ERROR] Unexpected error on idle client:', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['error'] });

module.exports = prisma;
