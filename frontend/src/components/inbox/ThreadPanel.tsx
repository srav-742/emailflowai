import type { EmailThread } from '@/types/email';
import { formatTimestamp } from '@/utils/formatters';

interface ThreadPanelProps {
  thread: EmailThread | null;
  composerText: string;
  instruction: string;
  isLoading: boolean;
  isGeneratingDraft: boolean;
  isSendingReply: boolean;
  onComposerChange: (value: string) => void;
  onInstructionChange: (value: string) => void;
  onGenerateDraft: () => void;
  onSendReply: () => void;
}

export function ThreadPanel({
  thread,
  composerText,
  instruction,
  isLoading,
  isGeneratingDraft,
  isSendingReply,
  onComposerChange,
  onInstructionChange,
  onGenerateDraft,
  onSendReply,
}: ThreadPanelProps) {
  if (isLoading) {
    return <section className="card thread-panel empty-state">Loading conversation detail...</section>;
  }

  if (!thread) {
    return (
      <section className="card thread-panel empty-state">
        Select a conversation to inspect the summary, action items, and reply composer.
      </section>
    );
  }

  return (
    <section className="card thread-panel">
      <div className="thread-panel-head">
        <div>
          <p className="eyebrow">Thread detail</p>
          <h2>{thread.subject}</h2>
          <p className="thread-subtitle">
            {thread.senderName} · {thread.senderEmail}
          </p>
        </div>

        <div className="thread-badges">
          <span className={`priority-chip priority-${thread.priority.toLowerCase()}`}>
            {thread.priority}
          </span>
          <span className="soft-chip">{thread.nextActionLabel}</span>
        </div>
      </div>

      <div className="thread-meta-grid">
        <div className="thread-summary">
          <strong>AI summary</strong>
          <p>{thread.aiSummary}</p>
        </div>
        <div className="thread-summary">
          <strong>Recommended tone</strong>
          <p>{thread.recommendedTone}</p>
        </div>
        <div className="thread-summary">
          <strong>Estimated time saved</strong>
          <p>{thread.estimatedMinutesSaved} minutes</p>
        </div>
        <div className="thread-summary">
          <strong>Sentiment</strong>
          <p>{thread.sentiment}</p>
        </div>
      </div>

      <div className="thread-body-grid">
        <div className="thread-column">
          <div className="thread-block">
            <strong>Action items</strong>
            <ul className="task-list">
              {thread.actionItems.map((item) => (
                <li key={item}>
                  <strong>{item}</strong>
                  <p>Captured from the conversation and ready for follow-up.</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="thread-block">
            <strong>Conversation timeline</strong>
            <ul className="message-list">
              {thread.messages.map((message) => (
                <li key={message.id} className={`message-item ${message.direction.toLowerCase()}`}>
                  <div className="message-header">
                    <strong>{message.senderName}</strong>
                    <time dateTime={message.sentAt}>{formatTimestamp(message.sentAt)}</time>
                  </div>
                  <p>{message.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="thread-column">
          <div className="thread-block">
            <strong>Guide the draft</strong>
            <textarea
              className="instruction-input"
              rows={3}
              value={instruction}
              placeholder="Example: keep it concise and propose Tuesday afternoon."
              onChange={(event) => onInstructionChange(event.target.value)}
            />
            <button
              className="secondary-button full-width"
              type="button"
              onClick={onGenerateDraft}
              disabled={isGeneratingDraft}
            >
              {isGeneratingDraft ? 'Generating AI draft...' : 'Generate Reply'}
            </button>
          </div>

          <div className="thread-block">
            <strong>Reply composer</strong>
            <textarea
              className="composer-input"
              rows={12}
              value={composerText}
              onChange={(event) => onComposerChange(event.target.value)}
            />
            <button
              className="primary-button full-width"
              type="button"
              onClick={onSendReply}
              disabled={isSendingReply || !composerText.trim()}
            >
              {isSendingReply ? 'Sending reply...' : 'Send Reply'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
