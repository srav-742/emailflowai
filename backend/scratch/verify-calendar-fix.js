const prisma = require('../src/config/database');
const { syncCalendar } = require('../src/services/calendarService');

async function verify() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'sravyadhadi@gmail.com' }
    });

    if (!user) {
      console.log('User sravyadhadi@gmail.com not found.');
      return;
    }

    console.log(`Starting sync for user: ${user.email} (${user.id})`);
    
    // This will trigger migrateAndGetClient in getAuthClient.js 
    // because we know oauth_tokens table is empty.
    const results = await syncCalendar(user.id);
    
    console.log('✅ Sync successful!');
    console.log(`Synced ${results.length} events.`);
    
    if (results.length > 0) {
      console.log('Sample events:');
      results.slice(0, 3).forEach(e => console.log(`- ${e.title} (${e.startTime})`));
    }

  } catch (error) {
    console.error('❌ Sync failed!');
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
