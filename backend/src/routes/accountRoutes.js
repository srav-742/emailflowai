const express = require('express');
const { listAccounts, updateAccount, disconnectAccount } = require('../services/accountService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const accounts = await listAccounts(req.user.id);
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', authenticate, async (req, res) => {
  try {
    const account = await updateAccount(req.params.id, req.body);
    res.json(account);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await disconnectAccount(req.params.id);
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
