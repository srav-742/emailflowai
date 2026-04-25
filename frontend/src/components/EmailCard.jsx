import { useState } from 'react';
import { emailAPI } from '../services/api';
import ReplyGenerator from './ReplyGenerator';

const EmailCard = ({ email, onUpdate, compact = false, onThreadClick = null, isThreadHead = false, isThreaded = false }) => {
  const [expanded, setExpanded] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [showReply, setShowReply] = useState(false);

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

  const handleExtractTasks = async () => {
    try {
      setExtractingTasks(true);
      await emailAPI.extractTasks(email.id);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Task extraction error:', error);
    } finally {
      setExtractingTasks(false);
    }
  };

  const showDetails = expanded || !compact;
  const showControls = (!compact || expanded) && !isThreaded;
  const summaryText = email.summary || email.snippet || 'No summary available yet. Refresh summary to analyze this email.';

  return (
    <article className={`mail-card ${compact ? 'mail-card-compact' : ''} ${isThreaded ? 'mail-card-threaded' : ''}`} data-legacy-icon={getCategoryIcon(email.category)}>
      <div className="mail-card-top">
        <button className="mail-card-header" onClick={() => setExpanded((value) => !value)}>
          <span className="mail-avatar" style={{ background: email.priority === 'high' ? 'linear-gradient(135deg, #ef4444, #f97316)' : 'linear-gradient(135deg, var(--highlight), var(--accent))' }}>
            {(email.senderName || email.sender || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="mail-card-meta">
            <strong>{email.subject || 'No subject'}</strong>
            <span>{email.senderName || email.sender || 'Unknown sender'}</span>
          </div>
        </button>

        <div className="mail-card-side">
          {isThreadHead && onThreadClick && (
            <button className="button button-ghost thread-bubble" onClick={(e) => { e.stopPropagation(); onThreadClick(); }}>
              💬 View thread
            </button>
          )}
          <span className="mail-pill" style={{
            color: getPriorityColor(email.priority),
            borderColor: `${getPriorityColor(email.priority)}40`,
            background: getPriorityBg(email.priority)
          }}>
            {email.priority || 'normal'}
          </span>
          <span className="mail-timestamp">{new Date(email.receivedAt || email.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="mail-summary mail-summary-card" style={{
        background: 'rgba(47, 111, 228, 0.05)',
        border: '1px solid rgba(47, 111, 228, 0.12)',
        borderRadius: '12px',
        padding: '0.85rem 1rem'
      }}>
        <span className="eyebrow">{email.priority === 'high' || email.actionRequired ? 'Priority insight' : 'AI takeaway'}</span>
        <p style={{ color: 'var(--muted-strong)' }}>{summaryText}</p>
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
        {email.followUp && <span className="mail-label mail-label-accent">follow-up</span>}
        {email.isSent && <span className="mail-label">sent</span>}
      </div>

      {showDetails && (
        <div className="mail-body-preview">
          <p>{email.body?.slice(0, compact ? 220 : 420) || email.snippet || 'No message body available.'}</p>
        </div>
      )}

      {showDetails && Array.isArray(email.tasks) && email.tasks.length > 0 && (
        <div className="mail-task-box">
          <div className="task-row-top">
            <strong>📋 Extracted tasks</strong>
            <span className="mail-label">{email.tasks.length}</span>
          </div>

          <div className="mail-task-list">
            {email.tasks.map((task, index) => (
              <div key={task.id || `${email.id}-task-${index}`} className="mail-task-item">
                <div className="task-row-top">
                  <strong>{task.task}</strong>
                  <span className={`mail-pill ${task.priority === 'high' ? 'high' : task.priority === 'low' ? 'low' : 'normal'}`}>
                    {task.priority || 'medium'}
                  </span>
                </div>
                <div className="task-meta-row">
                  <span className="mail-label">{task.deadline || 'No deadline'}</span>
                  {task.completed ? <span className="mail-label mail-label-accent">completed</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showControls ? <div className="mail-actions">
        <button className="button button-ghost" onClick={handleAISummarize} disabled={summarizing}>
          {summarizing ? '✨ Summarizing...' : '🤖 AI Summary'}
        </button>
        <button className="button button-ghost" onClick={handleAIClassify} disabled={classifying}>
          {classifying ? '🏷️ Classifying...' : '📊 Reclassify'}
        </button>
        <button className="button button-ghost" onClick={handleExtractTasks} disabled={extractingTasks}>
          {extractingTasks ? '⏳ Extracting...' : '✅ Extract Tasks'}
        </button>
        <button className="button button-secondary" onClick={() => setShowReply((value) => !value)}>
          {showReply ? '✖ Close' : '✍️ Reply'}
        </button>
      </div> : null}

      {showReply && showControls ? <ReplyGenerator email={email} onClose={() => setShowReply(false)} onSent={onUpdate} /> : null}
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
