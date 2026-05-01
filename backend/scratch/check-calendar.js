const prisma = require('../src/config/database');

async function checkStatus() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'sravyadhadi@gmail.com' },
      include: {
        calendarEvents: true
      }
    });

    if (!user) {
      console.log('User not found.');
      return;
    }

    console.log('--- User Google Connection Status ---');
    console.log('Email:', user.email);
    console.log('Has Refresh Token:', !!user.refreshToken);
    console.log('Has Access Token:', !!user.accessToken);
    console.log('Token Expiry:', user.tokenExpiry);
    console.log('Calendar Events Count:', user.calendarEvents.length);

    if (user.calendarEvents.length > 0) {
      console.log('Last 3 Events:');
      user.calendarEvents.slice(0, 3).forEach(e => {
        console.log(`- ${e.title} (${e.startTime})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStatus();
