const express = require('express');
const { 
  sync, 
  getEvents, 
  getTodayEvents, 
  addReminder 
} = require('../controllers/calendarController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate);

router.post('/sync', asyncHandler(sync));
router.get('/events', asyncHandler(getEvents));
router.get('/today', asyncHandler(getTodayEvents));
router.post('/add-reminder', asyncHandler(addReminder));

module.exports = router;
