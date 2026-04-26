require('dotenv').config();
const prisma = require('../src/config/database');

const IGNORED_PATTERNS = [
  /People You May Know/i,
  /LinkedIn/i,
  /Unsubscribe/i,
  /Newsletter/i,
  /Promotion/i,
  /Security Alert/i,
  /Verify your email/i,
  /Password reset/i,
  /Job alert from/i,
  /Suggested for you/i,
];

async function cleanupNoise() {
  console.log('Cleaning up noise in Emails and ActionItems...');
  
  // 1. Clean up ActionItems
  const items = await prisma.actionItem.findMany({ include: { email: true } });
  let deletedItemsCount = 0;
  for (const item of items) {
    const textToMatch = `${item.email?.subject || ''} ${item.title || ''}`.toLowerCase();
    if (IGNORED_PATTERNS.some(p => p.test(textToMatch))) {
      await prisma.actionItem.delete({ where: { id: item.id } });
      deletedItemsCount++;
    }
  }
  
  // 2. Clean up Email tasks JSON
  const emails = await prisma.email.findMany({
    select: { id: true, subject: true, sender: true, tasks: true }
  });
  let updatedEmailsCount = 0;
  for (const email of emails) {
    if (!email.tasks || (Array.isArray(email.tasks) && email.tasks.length === 0)) continue;
    const textToMatch = `${email.subject || ''} ${email.sender || ''}`.toLowerCase();
    if (IGNORED_PATTERNS.some(p => p.test(textToMatch))) {
      await prisma.email.update({
        where: { id: email.id },
        data: { tasks: [] }
      });
      updatedEmailsCount++;
    }
  }
  
  console.log(`Deleted ${deletedItemsCount} noise action items.`);
  console.log(`Cleared tasks for ${updatedEmailsCount} noise emails.`);
  process.exit(0);
}

cleanupNoise().catch(err => {
  console.error(err);
  process.exit(1);
});
