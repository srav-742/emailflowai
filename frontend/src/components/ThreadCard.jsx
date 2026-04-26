import { useState } from 'react';

const ThreadCard = ({ thread, onClick }) => {
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#ef4444';
      case 'normal': return '#3b82f6';
      case 'low': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  const getPriorityBg = (priority) => {
    switch (priority) {
      case 'high': return 'rgba(239, 68, 68, 0.1)';
      case 'normal': return 'rgba(59, 130, 246, 0.1)';
      case 'low': return 'rgba(107, 114, 128, 0.1)';
      default: return 'rgba(156, 163, 175, 0.1)';
    }
  };

  return (
    <article className="mail-card thread-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="mail-card-top">
        <div className="mail-card-header">
          <span className="mail-avatar" style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
            📂
          </span>
          <div className="mail-card-meta">
            <strong>{thread.company || 'Unknown Opportunity'}</strong>
            <span style={{ color: 'var(--highlight)', fontWeight: 600 }}>
              {thread.role || 'Professional Conversation'} ({thread.emailCount} emails)
            </span>
          </div>
        </div>

        <div className="mail-card-side">
          <span className="mail-pill" style={{
            color: getPriorityColor(thread.priority),
            borderColor: `${getPriorityColor(thread.priority)}40`,
            background: getPriorityBg(thread.priority),
            fontWeight: 'bold'
          }}>
            {thread.priority === 'high' ? '🚨 ' : thread.priority === 'low' ? '🟢 ' : '🟡 '}
            {thread.priority?.toUpperCase() || 'NORMAL'}
          </span>
          <span className="mail-timestamp">{new Date(thread.lastReceivedAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="mail-summary" style={{ 
        marginTop: '1rem', 
        padding: '1rem', 
        background: 'rgba(99, 102, 241, 0.05)', 
        borderRadius: '12px',
        borderLeft: `4px solid ${getPriorityColor(thread.priority)}`
      }}>
        <span className="eyebrow" style={{ color: 'var(--highlight)' }}>Thread Intelligence</span>
        <p style={{ 
          marginTop: '0.5rem', 
          color: 'var(--text)', 
          fontSize: '0.95rem', 
          lineHeight: '1.5',
          whiteSpace: 'pre-line'
        }}>
          {thread.summary || 'Analyzing conversation history... Click to view thread.'}
        </p>
      </div>

      <div className="mail-label-row" style={{ marginTop: '1rem' }}>
        <span className="mail-category">{thread.category || 'general'}</span>
        {thread.deadline && <span className="mail-label mail-label-accent">⏰ Deadline: {thread.deadline}</span>}
        {thread.actionRequired && <span className="mail-label mail-label-accent">Action Required</span>}
      </div>

      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button className="button button-ghost" style={{ fontSize: '0.85rem' }}>
          View full conversation →
        </button>
      </div>
    </article>
  );
};

export default ThreadCard;
