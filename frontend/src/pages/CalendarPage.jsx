import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../components/CalendarPage.css';

const CalendarPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/calendar/events?days=7', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(response.data);
    } catch (err) {
      setError('Failed to load calendar events. Please ensure you have connected your Google Calendar.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const token = localStorage.getItem('token');
      await axios.post('/api/calendar/sync', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchEvents();
    } catch (err) {
      setError('Sync failed. You might need to re-connect your Gmail to authorize calendar access.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Group events by date
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
          <div className="error-icon">⚠️</div>
          <div className="error-text">
            <h3>Authorization Required</h3>
            <p>{error}</p>
            <a href="/gmail-connect" className="reconnect-link">Reconnect Google Account</a>
          </div>
        </div>
      ) : Object.keys(groupedEvents).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
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
                      {event.description && <p className="event-desc">{event.description.substring(0, 100)}...</p>}
                      {event.meetingLink && (
                        <a 
                          href={event.meetingLink} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="meeting-link"
                        >
                          Join Meeting
                        </a>
                      )}
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
