import React, { useState, useEffect } from 'react';
import { emailAPI } from '../services/api';
import EmailCard from './EmailCard';

/**
 * ThreadView
 * 
 * Displays a group of emails that share the same threadId.
 * Provides a "conversation" feel by stacking messages chronologically.
 */
const ThreadView = ({ threadId, onBack }) => {
  const [threadData, setThreadData] = useState({ emails: [], threadId: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchThread = async () => {
      try {
        setLoading(true);
        const response = await emailAPI.getThreadById(threadId);
        setThreadData(response.data);
      } catch (err) {
        console.error('[ThreadView] Load failed:', err);
        setError('Failed to load conversation history.');
      } finally {
        setLoading(false);
      }
    };

    if (threadId) fetchThread();
  }, [threadId]);

  if (loading) {
    return (
      <div className="thread-loading">
        <div className="app-loading-spinner"></div>
        <p>Reconstructing conversation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-alert">
        <p>{error}</p>
        <button className="button button-ghost" onClick={onBack}>Back to Inbox</button>
      </div>
    );
  }

  return (
    <div className="thread-container">
      <div className="thread-header">
        <button className="button button-ghost" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to list
        </button>
        <div className="thread-meta">
          <span className="eyebrow">Thread Intelligence</span>
          <h2>{threadData.emails[0]?.subject || 'Untitled Thread'}</h2>
          <p>{threadData.emails.length} messages in this conversation</p>
        </div>
      </div>

      {threadData.metadata?.summary && (
        <div className="surface-card" style={{ 
          marginBottom: '2rem', 
          borderLeft: '4px solid var(--highlight)',
          background: 'rgba(124, 58, 237, 0.03)',
          padding: '1.5rem'
        }}>
          <span className="eyebrow" style={{ color: 'var(--highlight)' }}>Opportunity Briefing</span>
          <p style={{ 
            marginTop: '0.75rem', 
            fontSize: '1.1rem', 
            lineHeight: '1.6', 
            color: 'var(--text)',
            whiteSpace: 'pre-line'
          }}>
            {threadData.metadata.summary}
          </p>
          {threadData.metadata.deadline && (
            <div style={{ marginTop: '1rem' }}>
              <span className="mail-pill" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                ⏰ Next Deadline: {threadData.metadata.deadline}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="thread-stack">
        {threadData.emails.map((email, index) => (
          <div key={email.id} className="thread-item" style={{ animationDelay: `${index * 50}ms` }}>
            <EmailCard email={email} isThreaded={true} />
            {index < threadData.emails.length - 1 && (
              <div className="thread-connector"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThreadView;
