const { google } = require('googleapis');

// Create Gmail client with access tokens
const getGmailClient = (accessToken, refreshToken) => {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 5000}/api/auth/gmail/callback`;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
};

module.exports = { getGmailClient };
