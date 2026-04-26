import { useState, useEffect } from 'react';
import { followUpAPI } from '../services/api';

const WaitingList = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await followUpAPI.getItems();
      setItems(response.data.items || []);
    } catch (error) {
      console.error('Failed to fetch follow-ups:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleSnooze = async (id) => {
    try {
      await followUpAPI.snooze(id, 2);
      fetchItems();
    } catch (error) {
      console.error('Failed to snooze:', error);
    }
  };

  const handleDismiss = async (id) => {
    try {
      await followUpAPI.dismiss(id);
      fetchItems();
    } catch (error) {
      console.error('Failed to dismiss:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="app-loading-spinner" style={{ margin: '0 auto' }}></div>
      </div>
    );
  }

  return (
    <div className="surface-card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow">Tracking</span>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Waiting for Reply</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted)' }}>
          <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>⏳</span>
          <p>No active follow-ups. You're all caught up!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.map((item) => (
            <div 
              key={item.id}
              className="task-item"
              style={{
                padding: '1.2rem',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                   <span style={{ 
                     fontSize: '0.7rem', 
                     padding: '0.2rem 0.6rem', 
                     borderRadius: '99px', 
                     background: item.status === 'snoozed' ? 'var(--warning-glow)' : 'var(--accent-glow)',
                     color: item.status === 'snoozed' ? 'var(--warning)' : 'var(--accent-light)',
                     fontWeight: 'bold',
                     textTransform: 'uppercase'
                   }}>
                     {item.status}
                   </span>
                   <h4 style={{ margin: 0, fontSize: '1rem' }}>{item.recipientEmail}</h4>
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                  {item.subject}
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.6rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    📤 Sent: {new Date(item.sentAt).toLocaleDateString()}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--cyan)' }}>
                    🔔 Remind: {new Date(item.remindAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="button button-ghost" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => handleSnooze(item.id)}
                >
                  Snooze
                </button>
                <button 
                  className="button button-secondary" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  onClick={() => handleDismiss(item.id)}
                >
                  Mark Done
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WaitingList;
