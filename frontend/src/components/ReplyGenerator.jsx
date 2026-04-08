import { useState } from 'react';
import { emailAPI } from '../services/api';

const ReplyGenerator = ({ email, onClose, onSent }) => {
  const [tone, setTone] = useState('professional');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [editing, setEditing] = useState(false);
  const [editedReply, setEditedReply] = useState('');
  const [styleProfile, setStyleProfile] = useState(null);

  const normalizeReply = (value = '') => String(value).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

  const handleGenerateReply = async () => {
    try {
      setGenerating(true);
      setStatus('');
      const response = await emailAPI.aiGenerateReply(email.id, tone);
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
      if (onSent) {
        await onSent();
      }
      setStatus('Reply sent successfully.');
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (error) {
      console.error('Reply send error:', error);
      setStatus('Reply could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="reply-panel">
      <div className="reply-panel-header">
        <div>
          <span className="eyebrow">AI reply studio</span>
          <h4>{email.subject || 'Draft reply'}</h4>
        </div>
        <button className="button button-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="reply-toolbar">
        <label className="tone-field">
          Tone
          <select value={tone} onChange={(event) => setTone(event.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="friendly">Friendly</option>
            <option value="formal">Formal</option>
          </select>
        </label>

        <button className="button button-primary" onClick={handleGenerateReply} disabled={generating}>
          {generating ? 'Generating...' : 'Generate draft'}
        </button>
      </div>

      {styleProfile?.ready ? (
        <div className="inline-alert">
          Writing in your voice: {styleProfile.tone}, {styleProfile.sentenceLength} sentences, {styleProfile.signatureStyle}.
        </div>
      ) : null}

      {!!(reply || editedReply) && (
        <div className="reply-editor">
          <div className="reply-editor-top">
            <strong>{editing ? 'Editing draft' : 'Generated draft'}</strong>
            <div className="button-row">
              {!editing && (
                <button className="button button-ghost" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
              <button className="button button-ghost" onClick={handleCopyToClipboard}>
                Copy
              </button>
            </div>
          </div>

          {editing ? (
            <textarea className="reply-textarea" value={editedReply} onChange={(event) => setEditedReply(event.target.value)} rows={8} />
          ) : (
            <div className="reply-preview">
              {(editedReply || reply).split('\n').map((line, index) => (
                <p key={`${line}-${index}`}>{line || '\u00A0'}</p>
              ))}
            </div>
          )}

          {editing && (
            <div className="button-row">
              <button className="button button-secondary" onClick={() => setEditing(false)}>
                Save draft
              </button>
              <button
                className="button button-ghost"
                onClick={() => {
                  setEditing(false);
                  setEditedReply(reply);
                }}
              >
                Revert
              </button>
            </div>
          )}

          <button className="button button-primary button-full" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending reply...' : 'Send with Gmail'}
          </button>
        </div>
      )}

      {status && <div className="inline-alert">{status}</div>}
    </div>
  );

  /*
  return (
    <div className="reply-generator">
      <div className="reply-header">
        <h3>✍️ AI Reply Generator</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="reply-controls">
        <label className="tone-selector">
          <span>Tone:</span>
          <select value={tone} onChange={(e) => setTone(e.target.value)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="friendly">Friendly</option>
            <option value="formal">Formal</option>
          </select>
        </label>

        <button 
          className="generate-btn" 
          onClick={handleGenerateReply}
          disabled={generating}
        >
          {generating ? '⏳ Generating...' : '🤖 Generate Reply'}
        </button>
      </div>

      {reply && (
        <div className="reply-content">
          <div className="reply-label">
            <span>Generated Reply {editing ? '(Editing)' : ''}</span>
            <div className="reply-actions">
              {!editing && (
                <button className="edit-btn" onClick={() => setEditing(true)}>
                  ✏️ Edit
                </button>
              )}
              <button className="copy-btn" onClick={handleCopyToClipboard}>
                📋 Copy
              </button>
            </div>
          </div>

          {editing ? (
            <textarea
              className="reply-textarea"
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              rows={8}
            />
          ) : (
            <div className="reply-text">
              <p>{editedReply || reply}</p>
            </div>
          )}

          {editing && (
            <div className="edit-actions">
              <button className="save-btn" onClick={() => setEditing(false)}>
                💾 Save Changes
              </button>
              <button className="cancel-btn" onClick={() => {
                setEditing(false);
                setEditedReply(reply);
              }}>
                Cancel
              </button>
            </div>
          )}

          <button className="send-btn" onClick={handleSend}>
            📤 Ready to Send
          </button>
        </div>
      )}
    </div>
  );
  */
};

export default ReplyGenerator;
