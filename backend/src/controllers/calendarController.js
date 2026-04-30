const calendarService = require('../services/calendarService');
const prisma = require('../config/database');

const sync = async (req, res) => {
  try {
    const events = await calendarService.syncCalendar(req.user.id);
    res.json({ message: `Successfully synced ${events.length} events`, count: events.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getEvents = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const timeMax = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);

    const events = await prisma.calendarEvent.findMany({
      where: {
        userId: req.user.id,
        startTime: {
          gte: new Date(),
          lte: timeMax
        }
      },
      orderBy: { startTime: 'asc' }
    });

    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
};

const getTodayEvents = async (req, res) => {
  try {
    const events = await calendarService.getEventsForBrief(req.user.id);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch today\'s events' });
  }
};

const addReminder = async (req, res) => {
  try {
    const { actionItemId } = req.body;
    if (!actionItemId) return res.status(400).json({ error: 'actionItemId is required' });

    const event = await calendarService.addReminder(req.user.id, actionItemId);
    res.json({ message: 'Reminder added to Google Calendar', eventId: event.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  sync,
  getEvents,
  getTodayEvents,
  addReminder
};
