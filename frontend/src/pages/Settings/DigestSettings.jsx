import { useState, useEffect } from 'react';
import { digestAPI } from '../../services/api';

const DigestSettings = () => {
  const [prefs, setPrefs] = useState({
    sendTime: '07:30',
    timezone: 'UTC',
    emailEnabled: true,
    includeActions: true,
    includeFollowups: true,
    maxEmails: 5
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const response = await digestAPI.getPreferences();
        setPrefs(response.data);
      } catch (error) {
        console.error('Failed to fetch preferences:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await digestAPI.updatePreferences(prefs);
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
      setMessage('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="app-loading-spinner" style={{ margin: '4rem auto' }}></div>;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <span className="eyebrow">Personalization</span>
        <h1 style={{ fontSize: '2.5rem', margin: '0.5rem 0' }}>Morning Brief Settings</h1>
        <p style={{ color: 'var(--text-dim)' }}>Customize how and when you receive your daily AI-powered intelligence summary.</p>
      </header>

      <form onSubmit={handleSave} className="surface-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Delivery Time</label>
            <input 
              type="time" 
              className="input" 
              value={prefs.sendTime}
              onChange={(e) => setPrefs({ ...prefs, sendTime: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Timezone</label>
            <select 
              className="input"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern (ET)</option>
              <option value="America/Chicago">Central (CT)</option>
              <option value="America/Denver">Mountain (MT)</option>
              <option value="America/Los_Angeles">Pacific (PT)</option>
              <option value="Asia/Kolkata">IST (India)</option>
            </select>
          </div>
        </div>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Content Sections</h3>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={prefs.emailEnabled}
              onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
              style={{ width: '1.2rem', height: '1.2rem' }}
            />
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>Email Delivery</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Send a copy of the brief to your inbox every morning.</span>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={prefs.includeActions}
              onChange={(e) => setPrefs({ ...prefs, includeActions: e.target.checked })}
              style={{ width: '1.2rem', height: '1.2rem' }}
            />
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>Action Items</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Include pending tasks and urgent to-dos.</span>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={prefs.includeFollowups}
              onChange={(e) => setPrefs({ ...prefs, includeFollowups: e.target.checked })}
              style={{ width: '1.2rem', height: '1.2rem' }}
            />
            <div>
              <span style={{ fontWeight: 600, display: 'block' }}>Follow-ups</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Track emails where you are waiting for a reply.</span>
            </div>
          </label>
        </div>

        <div className="form-group">
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Max Emails to Summarize</label>
          <input 
            type="number" 
            min="1" 
            max="10" 
            className="input" 
            value={prefs.maxEmails}
            onChange={(e) => setPrefs({ ...prefs, maxEmails: parseInt(e.target.value) })}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '1rem' }}>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
          {message && <span style={{ color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>{message}</span>}
        </div>
      </form>
    </div>
  );
};

export default DigestSettings;
