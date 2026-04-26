import { useState } from 'react';
import { emailAPI } from '../services/api';

const ReplyGenerator = ({ email, onClose, onSent }) => {
  const [tone, setTone] = useState('professional');
  const [intent, setIntent] = useState('general');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedReply, setEditedReply] = useState('');
  const [styleProfile, setStyleProfile] = useState(null);

  const normalizeReply = (value = '') => String(value).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

  const handleGenerateReply = async (selectedIntent = intent) => {
    try {
      setGenerating(true);
      setStatus('');
      setIntent(selectedIntent);
      
      const response = await emailAPI.aiGenerateReply(email.id, tone, selectedIntent);
      const generatedReply = response.data.reply;
      
      setReply(generatedReply);
      setEditedReply(generatedReply);
      setStyleProfile(response.data.style || null);
    } catch (error) {
      console.error('Reply generation error:', error);
      setStatus('Reply draft could not be generated right now.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(editedReply || reply);
  };

  const handleSend = async () => {
    try {
      setSending(true);
      setStatus('');
      const finalReply = editedReply || reply;
      const wasEdited = Boolean(reply) && normalizeReply(finalReply) !== normalizeReply(reply);
      await emailAPI.sendReply(email.id, finalReply, {
        generatedReply: reply,
        wasEdited,
      });
      if (onSent) await onSent();
      setStatus('Reply sent successfully.');
      setTimeout(onClose, 900);
    } catch (error) {
      console.error('Reply send error:', error);
      setStatus('Reply could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="reply-panel" style={{ background: 'var(--panel-elevated)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginTop: '1rem' }}>
      <div className="reply-panel-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--highlight)' }}>AI Reply Studio</span>
          <h4 style={{ margin: '0.3rem 0' }}>{email.subject || 'Drafting Reply'}</h4>
        </div>
        <button className="button button-ghost" onClick={onClose}>✕</button>
      </div>

      <div className="reply-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <label className="tone-field" style={{ flex: 1 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: '0.4rem' }}>Response Tone</span>
            <select value={tone} onChange={(e) => setTone(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--input)', border: '1px solid var(--border)' }}>
              <option value="professional">💼 Professional</option>
              <option value="friendly">😊 Friendly</option>
              <option value="casual">☕ Casual</option>
              <option value="formal">👔 Formal</option>
              <option value="short">⚡ Short & Concise</option>
            </select>
          </label>
          <button className="button button-primary" onClick={() => handleGenerateReply()} disabled={generating} style={{ height: '2.5rem' }}>
            {generating ? '✨ Generating...' : '🤖 Generate Default'}
          </button>
        </div>

        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: '0.6rem' }}>One-Click Smart Intents</span>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="button button-ghost" onClick={() => handleGenerateReply('accept')} disabled={generating} style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>✅ Accept / Yes</button>
            <button className="button button-ghost" onClick={() => handleGenerateReply('negotiate')} disabled={generating} style={{ borderColor: 'var(--cyan)', color: 'var(--cyan)' }}>🕒 Ask for Time / Info</button>
            <button className="button button-ghost" onClick={() => handleGenerateReply('decline')} disabled={generating} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>❌ Decline / No</button>
          </div>
        </div>
      </div>

      {styleProfile?.ready && (
        <div className="inline-alert" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          Mimicking your voice: <strong>{styleProfile.tone}</strong> tone, <strong>{styleProfile.sentenceLength}</strong> sentences.
        </div>
      )}

      {(reply || editedReply) && (
        <div className="reply-editor" style={{ background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: 'var(--radius-md)' }}>
          <div className="reply-editor-top" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <strong>{editing ? '✍️ Editing Draft' : '🤖 AI Suggestion'}</strong>
            <div className="button-row">
              {!editing && <button className="button button-ghost" onClick={() => setEditing(true)}>Edit</button>}
              <button className="button button-ghost" onClick={handleCopyToClipboard}>Copy</button>
            </div>
          </div>

          {editing ? (
            <textarea className="reply-textarea" value={editedReply} onChange={(e) => setEditedReply(e.target.value)} rows={8} style={{ width: '100%', background: 'transparent', border: '1px solid var(--highlight)', color: 'var(--text)', padding: '1rem', borderRadius: 'var(--radius-sm)' }} />
          ) : (
            <div className="reply-preview" style={{ whiteSpace: 'pre-line', lineHeight: '1.6', fontSize: '1rem', color: 'var(--text)' }}>
              {editedReply || reply}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
            <button className="button button-primary" onClick={handleSend} disabled={sending} style={{ flex: 1 }}>
              {sending ? '🚀 Sending...' : '📤 Send with Gmail'}
            </button>
            {editing && (
              <button className="button button-secondary" onClick={() => setEditing(false)}>Save Draft</button>
            )}
          </div>
        </div>
      )}

      {status && <div className={`status-pill ${status.includes('successfully') ? 'status-ok' : 'status-warn'}`} style={{ marginTop: '1rem' }}>{status}</div>}
    </div>
  );
};

export default ReplyGenerator;
