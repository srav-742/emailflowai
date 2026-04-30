const { google } = require('googleapis');
const prisma = require('../config/database');

/**
 * Sync Google Calendar events for the next 7 days.
 */
async function syncCalendar(userId) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { accessToken: true, refreshToken: true }
    });

    if (!user || !user.refreshToken) {
      throw new Error('User not connected to Google.');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const syncedEvents = [];

    for (const event of events) {
      const synced = await prisma.calendarEvent.upsert({
        where: {
          userId_googleEventId: {
            userId,
            googleEventId: event.id
          }
        },
        update: {
          title: event.summary || 'No Title',
          description: event.description || '',
          startTime: new Date(event.start.dateTime || event.start.date),
          endTime: new Date(event.end.dateTime || event.end.date),
          attendees: event.attendees || [],
          meetingLink: event.hangoutLink || event.location || '',
          syncedAt: new Date()
        },
        create: {
          userId,
          googleEventId: event.id,
          calendarId: 'primary',
          title: event.summary || 'No Title',
          description: event.description || '',
          startTime: new Date(event.start.dateTime || event.start.date),
          endTime: new Date(event.end.dateTime || event.end.date),
          attendees: event.attendees || [],
          meetingLink: event.hangoutLink || event.location || '',
        }
      });
      syncedEvents.push(synced);
    }

    return syncedEvents;
  } catch (error) {
    console.error('[CalendarService] Sync failed:', error.message);
    throw error;
  }
}

/**
 * Add an action item as a reminder (calendar event) to Google Calendar.
 */
async function addReminder(userId, actionItemId) {
  try {
    const [user, actionItem] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { accessToken: true, refreshToken: true }
      }),
      prisma.actionItem.findUnique({
        where: { id: actionItemId }
      })
    ]);

    if (!actionItem.dueDate) throw new Error('Action item has no due date.');

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
      summary: `Task: ${actionItem.title}`,
      description: actionItem.description || 'Action item from EmailFlow AI',
      start: {
        dateTime: new Date(actionItem.dueDate).toISOString(),
      },
      end: {
        dateTime: new Date(new Date(actionItem.dueDate).getTime() + 30 * 60 * 1000).toISOString(), // 30 min duration
      },
      reminders: {
        useDefault: true
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return response.data;
  } catch (error) {
    console.error('[CalendarService] Add reminder failed:', error.message);
    throw error;
  }
}

/**
 * Get events for the Morning Brief.
 */
async function getEventsForBrief(userId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return await prisma.calendarEvent.findMany({
    where: {
      userId,
      startTime: {
        gte: startOfDay,
        lte: endOfDay
      }
    },
    orderBy: {
      startTime: 'asc'
    }
  });
}

module.exports = {
  syncCalendar,
  addReminder,
  getEventsForBrief
};
