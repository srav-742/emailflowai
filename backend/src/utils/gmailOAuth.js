const { google } = require('googleapis');

function getConfiguredRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 5000}/api/auth/gmail/callback`;
}

function getConfiguredFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function getGmailOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    redirectUri: getConfiguredRedirectUri(),
    frontendUrl: getConfiguredFrontendUrl(),
  };
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getConfiguredRedirectUri(),
  );
}

function getGmailAuthUrl(state) {
  const oauth2Client = createOAuth2Client();
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: state || '',
  });
}

async function getGmailTokens(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function getGmailClient(accessToken, refreshToken) {
  const oauth2Client = createOAuth2Client();

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function getUserInfo(tokens) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const response = await oauth2.userinfo.get();
  return response.data;
}

module.exports = { getGmailAuthUrl, getGmailTokens, getGmailClient, getUserInfo, getConfiguredRedirectUri, getConfiguredFrontendUrl, getGmailOAuthConfig };
