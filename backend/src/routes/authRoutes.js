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
const { getGmailAuthUrl, getGmailTokens, getGmailOAuthConfig, getUserIdFromOAuthState } = require('../utils/gmailOAuth');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

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

    const userId = getUserIdFromOAuthState(String(state));
    const tokens = await getGmailTokens(code);
    await persistGmailTokens(userId, tokens);

    return res.redirect(`${frontendUrl}/auth/gmail-callback?status=success`);
  } catch (error) {
    console.error('Gmail callback error:', error);
    return res.redirect(`${frontendUrl}/auth/gmail-callback?error=gmail_auth_failed`);
  }
}

router.post('/firebase-login', asyncHandler(firebaseGoogleLogin));

// OTP-based email authentication & session management
const { 
  registerAndSendOtp, 
  verifyOtpHandler, 
  resendOtp, 
  refreshSession, 
  logout: otpLogout 
} = require('../controllers/otpAuthController');

const { requestOtpLimiter, verifyOtpLimiter, ipAuthLimiter } = require('../middleware/otpRateLimit');

router.post('/register-otp', ipAuthLimiter, requestOtpLimiter, asyncHandler(registerAndSendOtp));
router.post('/request-otp', ipAuthLimiter, requestOtpLimiter, asyncHandler(registerAndSendOtp));
router.post('/verify-otp', ipAuthLimiter, verifyOtpLimiter, asyncHandler(verifyOtpHandler));
router.post('/resend-otp', ipAuthLimiter, requestOtpLimiter, asyncHandler(resendOtp));
router.post('/refresh', ipAuthLimiter, asyncHandler(refreshSession));

router.get('/gmail/url', authenticate, (req, res) => {
  res.json(buildGmailAuthPayload(req.user.id));
});

router.get('/google/url', authenticate, (req, res) => {
  res.json(buildGmailAuthPayload(req.user.id));
});

router.get('/gmail/connect', authenticate, (req, res) => {
  res.redirect(getGmailAuthUrl(req.user.id));
});

router.get('/google/connect', authenticate, (req, res) => {
  res.redirect(getGmailAuthUrl(req.user.id));
});

router.get('/gmail/callback', asyncHandler(handleGmailCallback));
router.get('/google/callback', asyncHandler(handleGmailCallback));

router.post('/gmail/connect', authenticate, asyncHandler(saveGmailTokens));
router.get('/profile', authenticate, asyncHandler(getProfile));
router.post('/logout', asyncHandler(otpLogout));

// Outlook Integration
router.get('/outlook', asyncHandler(outlookAuth));
router.get('/outlook/callback', asyncHandler(outlookCallback));

module.exports = router;
