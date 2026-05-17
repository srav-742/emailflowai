import React, { useState, useEffect, useCallback } from 'react';
import '../components/CalendarPage.css';
import { calendarAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const CalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const { markGmailReconnectRequired } = useAuth();

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const response = await calendarAPI.getEvents(7);
      setEvents(response.data);
      setError(null);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to load calendar events.';
      if (/reconnect gmail|expired|revoked|no connected gmail/i.test(msg)) {
        markGmailReconnectRequired({
          message: 'Calendar sync is paused until Gmail is reconnected.',
          source: 'calendar',
        });
      }
      setError('Failed to load calendar events. Reconnect Gmail to restore calendar sync.');
    } finally {
      setLoading(false);
    }
  }, [markGmailReconnectRequired]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      await calendarAPI.sync();
      await fetchEvents();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Calendar sync failed.';
      if (msg.toLowerCase().includes('scope') || msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('reconnect')) {
        markGmailReconnectRequired({
          message: 'Calendar authorization needs Gmail reconnection before sync can continue.',
          source: 'calendar',
        });
        setError('Authorization required. Please reconnect Gmail to restore calendar access.');
      } else {
        setError(`Sync failed: ${msg}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const groupedEvents = events.reduce((acc, event) => {
    const date = new Date(event.startTime).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {});

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-content">
          <span className="eyebrow">Schedule & Meetings</span>
          <h1>Google Calendar</h1>
          <p>Your upcoming meetings synced from Google Calendar.</p>
        </div>
        <button
          className={`sync-btn ${syncing ? 'loading' : ''}`}
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? 'Syncing...' : 'Sync Calendar'}
        </button>
      </header>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Fetching your schedule...</p>
        </div>
      ) : error ? (
        <div className="error-card">
          <div className="error-icon">Authorization</div>
          <div className="error-text">
            <h3>Calendar access paused</h3>
            <p>{error}</p>
            <a href="/auth/gmail-connect?mode=reconnect" className="reconnect-link">Reconnect Google Account</a>
          </div>
        </div>
      ) : Object.keys(groupedEvents).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">Calendar</div>
          <h3>No upcoming meetings</h3>
          <p>Your calendar looks clear for the next 7 days.</p>
        </div>
      ) : (
        <div className="calendar-grid">
          {Object.entries(groupedEvents).map(([date, dayEvents]) => (
            <div key={date} className="day-group">
              <h2 className="date-header">{formatDate(dayEvents[0].startTime)}</h2>
              <div className="events-list">
                {dayEvents.map(event => (
                  <div key={event.id} className="event-card">
                    <div className="event-time">
                      <span className="start">{formatTime(event.startTime)}</span>
                      <span className="end">{formatTime(event.endTime)}</span>
                    </div>
                    <div className="event-info">
                      <h3 className="event-title">{event.title}</h3>
                      {event.description ? <p className="event-desc">{event.description.substring(0, 100)}...</p> : null}
                      {event.meetingLink ? (
                        <a
                          href={event.meetingLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="meeting-link"
                        >
                          Join Meeting
                        </a>
                      ) : null}
                    </div>
                    <div className="event-status">
                      <span className="status-dot active"></span>
                      Confirmed
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
