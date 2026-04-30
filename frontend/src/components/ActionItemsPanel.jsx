import { useState, useEffect } from 'react';
import { actionItemAPI, calendarAPI } from '../services/api';

const ActionItemsPanel = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await actionItemAPI.getItems({ status: filter });
      setItems(response.data.items || []);
    } catch (error) {
      console.error('Failed to fetch action items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [filter]);

  const handleToggleDone = async (id, currentStatus) => {
    try {
      const newStatus = currentStatus === 'done' ? 'pending' : 'done';
      await actionItemAPI.updateItem(id, { status: newStatus });
      fetchItems();
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  };

  const handleAddToCalendar = async (id) => {
    try {
      await calendarAPI.addReminder(id);
      alert('Task added to Google Calendar!');
    } catch (error) {
      console.error('Failed to add to calendar:', error);
      alert('Failed to add to calendar. Please ensure your Google account is connected with Calendar permissions.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this action item?')) return;
    try {
      await actionItemAPI.deleteItem(id);
      fetchItems();
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  return (
    <div className="surface-card action-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow">Productivity</span>
          <h2 style={{ margin: 0 }}>Action Items</h2>
        </div>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          className="button button-ghost"
          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
        >
          <option value="pending">Pending</option>
          <option value="done">Completed</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="app-loading-spinner" style={{ margin: '0 auto' }}></div>
          <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>Analyzing tasks...</p>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--muted)' }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>🎯</span>
              <p>No {filter} action items found.</p>
              <p style={{ fontSize: '0.8rem' }}>AI automatically extracts tasks during sync.</p>
            </div>
          ) : (
            items.map((item) => (
              <div 
                key={item.id} 
                className="task-item"
                style={{
                  padding: '1rem',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  transition: 'transform 0.2s, background 0.2s',
                  opacity: item.status === 'done' ? 0.6 : 1
                }}
              >
                <input 
                  type="checkbox" 
                  checked={item.status === 'done'}
                  onChange={() => handleToggleDone(item.id, item.status)}
                  style={{ marginTop: '0.25rem', cursor: 'pointer', width: '1.2rem', height: '1.2rem' }}
                />
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
                      {item.title}
                    </h4>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '0.1rem 0.4rem', 
                      borderRadius: '4px',
                      background: `${getPriorityColor(item.priority)}20`,
                      color: getPriorityColor(item.priority),
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      {item.priority}
                    </span>
                  </div>
                  
                  <p style={{ margin: '0.4rem 0 0.6rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {item.email?.subject || 'Direct Task'}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {item.dueDate ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                          📅 {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                        {item.status !== 'done' && (
                          <button 
                            onClick={() => handleAddToCalendar(item.id)}
                            style={{ 
                              background: 'rgba(99, 102, 241, 0.1)', 
                              border: '1px solid rgba(99, 102, 241, 0.2)',
                              color: '#818cf8',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              cursor: 'pointer'
                            }}
                          >
                            Add to Calendar
                          </button>
                        )}
                      </div>
                    ) : <span />}
                    
                    <button 
                      onClick={() => handleDelete(item.id)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#ef4444', 
                        cursor: 'pointer', 
                        fontSize: '0.8rem',
                        opacity: 0.5
                      }}
                      onMouseOver={(e) => e.target.style.opacity = 1}
                      onMouseOut={(e) => e.target.style.opacity = 0.5}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ActionItemsPanel;
