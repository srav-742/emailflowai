const express = require('express');
const { listAccounts, updateAccount, disconnectAccount } = require('../services/accountService');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const accounts = await listAccounts(req.user.id);
  res.json(accounts);
}));

router.patch('/:id', authenticate, asyncHandler(async (req, res) => {
  const account = await updateAccount(req.params.id, req.body);
  res.json(account);
}));

router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  await disconnectAccount(req.params.id);
  res.json({ message: 'Account disconnected successfully' });
}));

module.exports = router;
