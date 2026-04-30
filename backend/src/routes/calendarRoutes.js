const express = require('express');
const { 
  sync, 
  getEvents, 
  getTodayEvents, 
  addReminder 
} = require('../controllers/calendarController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/sync', sync);
router.get('/events', getEvents);
router.get('/today', getTodayEvents);
router.post('/add-reminder', addReminder);

module.exports = router;
