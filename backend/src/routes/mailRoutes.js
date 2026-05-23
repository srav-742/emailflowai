/**
 * mailRoutes.js — Universal Mail Connection Routes
 *
 * Provides endpoints for:
 *   - Connecting new email accounts (IMAP/SMTP/App Password)
 *   - Testing connection credentials
 *   - Auto-detecting provider from email
 *   - Listing supported providers
 */

const express = require('express');
const {
  connectMailAccount,
  testConnection,
  detectProvider,
  listProviders,
} = require('../controllers/mailConnectionController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

// Public endpoint — list supported providers
router.get('/providers', asyncHandler(listProviders));

// Authenticated endpoints
router.post('/connect', authenticate, asyncHandler(connectMailAccount));
router.post('/test-connection', authenticate, asyncHandler(testConnection));
router.get('/detect-provider', authenticate, asyncHandler(detectProvider));

module.exports = router;
