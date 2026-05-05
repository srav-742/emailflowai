const prisma = require('../src/config/database');
const { syncInbox } = require('../src/services/inboxSyncService');

async function verify() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'sravyadhadi@gmail.com' }
    });

    if (!user) {
      console.log('User sravyadhadi@gmail.com not found.');
      return;
    }

    console.log(`Starting Gmail sync for user: ${user.email} (${user.id})`);
    
    const results = await syncInbox(user.id, 10, { returnMeta: true });
    
    console.log('✅ Sync successful!');
    console.log(`Synced ${results.emails.length} emails.`);
    console.log(`Warning: ${results.warning}`);
    console.log(`Degraded: ${results.degraded}`);
    
    if (results.emails.length > 0) {
      console.log('Sample emails:');
      results.emails.slice(0, 3).forEach(e => console.log(`- ${e.subject} (${e.receivedAt})`));
    }

  } catch (error) {
    console.error('❌ Gmail Sync failed!');
    console.error('Error Message:', error.message);
    if (error.response) {
      console.error('Google API Error:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

verify();
