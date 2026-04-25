require('dotenv').config();
const prisma = require('../src/config/database');

async function main() {
  const users = await prisma.user.findMany({
    include: {
      emailAccounts: true,
      _count: {
        select: { emails: true }
      }
    }
  });

  console.log('--- User Connectivity Status ---');
  users.forEach(u => {
    console.log(`User: ${u.email}`);
    console.log(`  ID: ${u.id}`);
    console.log(`  Plan: ${u.plan}`);
    console.log(`  Emails: ${u._count.emails}`);
    console.log(`  Primary Gmail Access: ${Boolean(u.refreshToken)}`);
    console.log(`  Accounts (${u.emailAccounts.length}):`);
    u.emailAccounts.forEach(acc => {
      console.log(`    - ${acc.email}: ${acc.refreshToken ? '✅ Connected' : '❌ Disconnected'}`);
    });
    console.log(`  Last Sync: ${u.lastSyncAt}`);
    console.log('---------------------------');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
