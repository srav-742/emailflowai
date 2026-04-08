import { useState } from 'react';
import { emailAPI } from '../services/api';
import ReplyGenerator from './ReplyGenerator';

const EmailCard = ({ email, onUpdate, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [showReply, setShowReply] = useState(false);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return '#e53e3e';
      case 'normal': return '#3182ce';
      case 'low': return '#718096';
      default: return '#a0aec0';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'important': return '⭐';
      case 'promotions': return '🎁';
      case 'social': return '👥';
      case 'updates': return '🔔';
      default: return '📧';
    }
  };

  const handleAISummarize = async () => {
    try {
      setSummarizing(true);
      await emailAPI.aiSummarize(email.id);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('AI summarize error:', error);
    } finally {
      setSummarizing(false);
    }
  };

  const handleAIClassify = async () => {
    try {
      setClassifying(true);
      await emailAPI.aiClassify(email.id);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('AI classify error:', error);
    } finally {
      setClassifying(false);
    }
  };

  return (
    <article className={`mail-card ${compact ? 'mail-card-compact' : ''}`} data-legacy-icon={getCategoryIcon(email.category)}>
      <div className="mail-card-top">
        <button className="mail-card-header" onClick={() => setExpanded((value) => !value)}>
          <span className="mail-avatar">{(email.senderName || email.sender || '?').slice(0, 1).toUpperCase()}</span>
          <div className="mail-card-meta">
            <strong>{email.subject || 'No subject'}</strong>
            <span>{email.senderName || email.sender || 'Unknown sender'}</span>
          </div>
        </button>

        <div className="mail-card-side">
          <span className={`mail-pill ${email.priority}`}>{email.priority || 'normal'}</span>
          <span className="mail-timestamp">{new Date(email.receivedAt || email.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="mail-summary">
        <p>{email.summary || email.snippet || 'No summary available yet. Run AI summarize to refresh this thread.'}</p>
      </div>

      <div className="mail-label-row">
        <span className="mail-category" style={{ borderColor: getPriorityColor(email.priority) }}>
          {email.category || 'general'}
        </span>
        {(email.labels || []).slice(0, 4).map((label) => (
          <span key={label} className="mail-label">
            {label}
          </span>
        ))}
        {email.actionRequired && <span className="mail-label mail-label-accent">action-required</span>}
      </div>

      {(expanded || !compact) && (
        <div className="mail-body-preview">
          <p>{email.body?.slice(0, compact ? 220 : 420) || email.snippet || 'No message body available.'}</p>
        </div>
      )}

      <div className="mail-actions">
        <button className="button button-ghost" onClick={handleAISummarize} disabled={summarizing}>
          {summarizing ? 'Summarizing...' : 'AI summary'}
        </button>
        <button className="button button-ghost" onClick={handleAIClassify} disabled={classifying}>
          {classifying ? 'Classifying...' : 'Reclassify'}
        </button>
        <button className="button button-secondary" onClick={() => setShowReply((value) => !value)}>
          {showReply ? 'Close draft' : 'Open reply'}
        </button>
      </div>

      {showReply && <ReplyGenerator email={email} onClose={() => setShowReply(false)} />}
    </article>
  );

  /*
  return (
    <div className={`email-card ${expanded ? 'expanded' : ''}`}>
      <div className="email-header" onClick={() => setExpanded(!expanded)}>
        <div className="email-meta">
          <div className="email-avatar">
            {email.sender?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="email-info">
            <p className="email-sender">{email.sender || 'Unknown'}</p>
            <p className="email-time">
              {new Date(email.receivedAt || email.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="email-badges">
          <span 
            className="priority-badge" 
            style={{ backgroundColor: getPriorityColor(email.priority) }}
          >
            {email.priority}
          </span>
          <span className="category-badge">
            {getCategoryIcon(email.category)} {email.category}
          </span>
        </div>
      </div>

      <div className="email-subject">
        <h3>{email.subject || 'No Subject'}</h3>
      </div>

      {email.summary && (
        <div className="email-summary">
          <div className="summary-header">
            <span>🤖</span>
            <strong>AI Summary</strong>
          </div>
          <p>{email.summary}</p>
        </div>
      )}

      {expanded && (
        <div className="email-body">
          <p>{email.body?.substring(0, 500) || email.snippet || 'No content'}</p>
        </div>
      )}

      <div className="email-actions">
        <button 
          className="action-small" 
          onClick={handleAISummarize}
          disabled={summarizing}
          title="AI Summarize"
        >
          {summarizing ? '⏳' : '🤖'} Summarize
        </button>
        <button 
          className="action-small" 
          onClick={handleAIClassify}
          disabled={classifying}
          title="AI Classify"
        >
          {classifying ? '⏳' : '📊'} Classify
        </button>
        <button 
          className="action-small primary"
          onClick={() => setShowReply(!showReply)}
        >
          ✍️ Reply
        </button>
      </div>

      {showReply && (
        <ReplyGenerator 
          email={email} 
          onClose={() => setShowReply(false)} 
        />
      )}
    </div>
  );
  */
};

export default EmailCard;
