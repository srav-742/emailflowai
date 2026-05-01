const express = require('express');
const {
  firebaseGoogleLogin,
  saveGmailTokens,
  persistGmailTokens,
  getProfile,
  logout,
  outlookAuth,
  outlookCallback,
} = require('../controllers/authController');
const { getGmailAuthUrl, getGmailTokens, getGmailOAuthConfig } = require('../utils/gmailOAuth');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function buildGmailAuthPayload(userId) {
  const oauthConfig = getGmailOAuthConfig();
  return {
    ...oauthConfig,
    url: getGmailAuthUrl(userId),
  };
}

async function handleGmailCallback(req, res) {
  const { frontendUrl } = getGmailOAuthConfig();

  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${frontendUrl}/auth/gmail-callback?error=${encodeURIComponent(String(error))}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/auth/gmail-callback?error=missing_gmail_callback_data`);
    }

    const tokens = await getGmailTokens(code);
    await persistGmailTokens(String(state), tokens);

    return res.redirect(`${frontendUrl}/auth/gmail-callback?status=success`);
  } catch (error) {
    console.error('Gmail callback error:', error);
    return res.redirect(`${frontendUrl}/auth/gmail-callback?error=gmail_auth_failed`);
  }
}

router.post('/firebase-login', firebaseGoogleLogin);

router.get('/gmail/url', authenticate, (req, res) => {
  res.json(buildGmailAuthPayload(req.user.id));
});

router.get('/google/url', authenticate, (req, res) => {
  res.json(buildGmailAuthPayload(req.user.id));
});

router.get('/gmail/callback', handleGmailCallback);
router.get('/google/callback', handleGmailCallback);

router.post('/gmail/connect', authenticate, saveGmailTokens);
router.get('/profile', authenticate, getProfile);
router.post('/logout', authenticate, logout);

// Outlook Integration
router.get('/outlook', outlookAuth);
router.get('/outlook/callback', outlookCallback);

module.exports = router;
