
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

async function testConnection() {
  console.log('Testing connection to:', connectionString.replace(/:[^:@]+@/, ':****@'));
  
  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL using pg Pool');
    const res = await client.query('SELECT NOW()');
    console.log('Query result:', res.rows[0]);
    client.release();
  } catch (err) {
    console.error('Failed to connect using pg Pool:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.code) console.error('Code:', err.code);
  } finally {
    await pool.end();
  }
}

testConnection();
