const express = require('express');
const router = express.Router();
const { logClientError } = require('../controllers/errorController');
const { authenticate } = require('../middleware/auth');

// We use optional authentication so errors during login/signup can still be logged
router.post('/log', (req, res, next) => {
  // Try to authenticate but proceed if it fails (guest user errors)
  authenticate(req, res, () => {
    logClientError(req, res);
  }).catch(() => {
    logClientError(req, res);
  });
});

module.exports = router;
