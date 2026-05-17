require('dotenv').config();
const prisma = require('../src/config/database');

async function main() {
  try {
    const count = await prisma.failedJob.count();
    console.log(`✅ Success! Found ${count} records in failed_jobs table.`);
  } catch (error) {
    console.error(`❌ Error: Could not access failed_jobs table.`);
    console.error(error.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
