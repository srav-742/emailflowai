const { google } = require('googleapis');
const crypto = require('crypto');

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || 'emailflow-oauth-state-dev-secret';
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signStatePayload(encodedPayload) {
  return crypto.createHmac('sha256', getStateSecret()).update(encodedPayload).digest('base64url');
}

function createOAuthState(userId) {
  const payload = base64UrlEncode(JSON.stringify({
    userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  }));
  return `${payload}.${signStatePayload(payload)}`;
}

function getUserIdFromOAuthState(state) {
  if (!state) return null;

  if (!state.includes('.')) {
    throw new Error('OAuth state must be signed.');
  }

  const [encodedPayload, signature] = String(state).split('.');
  const expectedSignature = signStatePayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature || '');
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid OAuth state signature.');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload.userId || !payload.exp || Date.now() > payload.exp) {
    throw new Error('OAuth state expired or invalid.');
  }

  return payload.userId;
}

function getConfiguredRedirectUri() {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  
  // Auto-detect Render environment
  if (process.env.RENDER_EXTERNAL_URL) {
    return `${process.env.RENDER_EXTERNAL_URL}/api/auth/gmail/callback`;
  }
  
  return `http://localhost:${process.env.PORT || 5000}/api/auth/gmail/callback`;
}

function getConfiguredFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  
  // Default for this project's production frontend
  if (process.env.NODE_ENV === 'production') {
    return 'https://emailflowai-ai.vercel.app'; // Recommended Vercel URL
  }

  return 'http://localhost:5173';
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
  const oauthState = createOAuthState(state);
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
    prompt: 'select_account consent',
    state: oauthState,
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

module.exports = {
  createOAuthState,
  getUserIdFromOAuthState,
  getGmailAuthUrl,
  getGmailTokens,
  getGmailClient,
  getUserInfo,
  getConfiguredRedirectUri,
  getConfiguredFrontendUrl,
  getGmailOAuthConfig,
};
