const prisma = require('../src/config/database');
const { google } = require('googleapis');

async function inspectScopes() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'sravyadhadi@gmail.com' }
    });

    if (!user || !user.accessToken) {
      console.log('User or access token not found.');
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken
    });

    const tokenInfo = await oauth2Client.getTokenInfo(user.accessToken);
    console.log('--- Token Scope Inspection ---');
    console.log('Scopes Granted:', tokenInfo.scopes);
    
    const requiredScopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const missing = requiredScopes.filter(s => !tokenInfo.scopes.includes(s));
    
    if (missing.length > 0) {
      console.log('MISSING SCOPES:', missing);
    } else {
      console.log('SUCCESS: All required calendar scopes are present in the current token.');
    }

  } catch (error) {
    console.error('Error inspecting token:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

inspectScopes();
