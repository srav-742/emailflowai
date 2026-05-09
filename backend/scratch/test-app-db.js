
require('dotenv').config();
const prisma = require('../src/config/database');

async function testRealConfig() {
  console.log('Testing actual application database configuration...');
  
  try {
    // Wait a bit for the internal $connect to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    console.log('Successfully queried database using application config!');
    console.log('Result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Failed to query database using application config:', err.message);
    process.exit(1);
  }
}

testRealConfig();
