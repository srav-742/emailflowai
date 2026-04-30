import { useState } from 'react';
import { emailAPI } from '../services/api';
import { useBilling } from '../context/BillingContext';
import ReplyGenerator from './ReplyGenerator';

const EmailCard = ({ email, onUpdate, compact = false, onThreadClick = null, isThreadHead = false, isThreaded = false }) => {
  const { triggerUpgradeModal } = useBilling();
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
      if (error.response?.status === 403) {
        triggerUpgradeModal('Deep AI Summaries');
      } else {
        console.error('AI summarize error:', error);
      }
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
      if (error.response?.status === 403) {
        triggerUpgradeModal('AI Classification');
      } else {
        console.error('AI classify error:', error);
      }
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

  const handleCategoryChange = async (newCategory) => {
    try {
      await emailAPI.updateEmailCategory(email.id, newCategory);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  const showDetails = expanded || !compact;
  const showControls = (!compact || expanded) && !isThreaded;
  
  // Parse structured summary if available
  let summaryText = email.summary || email.snippet || 'No summary available yet. Refresh summary to analyze this email.';
  let summaryMeta = null;
  
  try {
    if (email.summary && (email.summary.startsWith('{') || email.summary.startsWith('['))) {
      const parsed = JSON.parse(email.summary);
      if (parsed.formatted_summary) {
        summaryText = parsed.formatted_summary;
        summaryMeta = parsed;
      }
    }
  } catch (e) {
    // Fallback to plain text
  }

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
            background: getPriorityBg(email.priority),
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}>
            {email.priority === 'high' ? '🚨 ' : email.priority === 'low' ? '🟢 ' : '🟡 '}
            {email.priority || 'normal'}
          </span>
          <span className="mail-timestamp">{new Date(email.receivedAt || email.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="mail-summary mail-summary-card" style={{
        background: email.priority === 'high' ? 'rgba(239, 68, 68, 0.03)' : 'rgba(47, 111, 228, 0.05)',
        border: email.priority === 'high' ? '1px solid rgba(239, 68, 68, 0.15)' : '1px solid rgba(47, 111, 228, 0.12)',
        borderRadius: '12px',
        padding: '1rem',
        boxShadow: email.priority === 'high' ? '0 4px 12px rgba(239, 68, 68, 0.08)' : 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow" style={{ color: email.priority === 'high' ? '#ef4444' : 'var(--accent)' }}>
            {email.priority === 'high' ? '⚡ CRITICAL BRIEFING' : '🧠 AI COMMANDER BRIEF'}
          </span>
          {summaryMeta?.company && (
            <span className="mail-pill" style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)' }}>
              🏢 {summaryMeta.company}
            </span>
          )}
        </div>
        <p style={{ 
          color: 'var(--muted-strong)', 
          whiteSpace: 'pre-line', 
          marginTop: '0.75rem', 
          fontSize: '0.95rem',
          lineHeight: '1.5'
        }}>{summaryText}</p>
        
        {summaryMeta?.action_url && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <a 
              href={summaryMeta.action_url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="button button-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            >
              🚀 Apply / Open Link
            </a>
            {summaryMeta.deadline && (
              <button 
                className="button button-ghost"
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', border: '1px solid #ccc' }}
                onClick={() => alert(`Deadline: ${summaryMeta.deadline}`)}
              >
                📅 Add to Calendar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mail-label-row">
        <select 
          className="mail-category-select" 
          value={email.category || 'other'} 
          onChange={(e) => handleCategoryChange(e.target.value)}
          style={{ 
            borderColor: getPriorityColor(email.priority),
            background: 'transparent',
            color: 'inherit',
            fontSize: '0.8rem',
            padding: '2px 8px',
            borderRadius: '8px',
            cursor: 'pointer',
            border: `1px solid ${getPriorityColor(email.priority)}`
          }}
        >
          <option value="focus_today">🔥 Focus Today</option>
          <option value="read_later">📚 Read Later</option>
          <option value="newsletter">📧 Newsletter</option>
          <option value="other">💬 Other</option>
          <option value="uncategorized">❓ Uncategorized</option>
        </select>
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
};

export default EmailCard;
