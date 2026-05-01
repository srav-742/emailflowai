require('dotenv').config();
const { google } = require('googleapis');
const prisma = require('../src/config/database');

async function testRefresh() {
  const userId = 'a502293f-ca6a-4d5e-8cbf-3ca17f474547';
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true, email: true }
    });

    if (!user || !user.refreshToken) {
      console.log(`User ${userId} has no refresh token.`);
      return;
    }

    console.log(`Testing refresh for ${user.email}...`);
    console.log(`Using Client ID: ${process.env.GOOGLE_CLIENT_ID}`);
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: user.refreshToken
    });

    const response = await oauth2Client.refreshAccessToken();
    console.log('Refresh successful!');
    console.log('New Access Token:', response.credentials.access_token.substring(0, 10) + '...');
    
  } catch (err) {
    console.error('Refresh failed:', err.message);
    if (err.response) {
      console.error('Response Data:', JSON.stringify(err.response.data, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

testRefresh();
