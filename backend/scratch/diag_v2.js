const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'PRESENT' : 'MISSING');
  if (!process.env.DATABASE_URL) return;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const res = await pool.query('SELECT category, count(*) FROM "emails" GROUP BY category');
    console.log('--- Categories in DB ---');
    console.table(res.rows);
    
    const samples = await pool.query('SELECT subject, category, summary FROM "emails" LIMIT 5');
    console.log('--- Sample Emails ---');
    console.table(samples.rows);
  } catch (err) {
    console.error('Query failed:', err.message);
  } finally {
    await pool.end();
  }
}

main();
