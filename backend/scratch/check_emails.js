require('dotenv').config();
const prisma = require('../src/config/database');

async function main() {
  const categories = await prisma.email.groupBy({
    by: ['category'],
    _count: true
  });

  console.log('--- Email Categories Count ---');
  console.log(JSON.stringify(categories, null, 2));

  const sampleEmails = await prisma.email.findMany({
    take: 5,
    select: {
      id: true,
      subject: true,
      category: true,
      summary: true,
      snippet: true
    }
  });

  console.log('\n--- Sample Emails (Summary Check) ---');
  sampleEmails.forEach(e => {
    console.log(`ID: ${e.id}`);
    console.log(`Subject: ${e.subject}`);
    console.log(`Category: ${e.category}`);
    console.log(`Summary: ${e.summary}`);
    console.log(`Snippet: ${e.snippet}`);
    console.log('---');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
