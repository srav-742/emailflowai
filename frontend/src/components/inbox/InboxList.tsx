import type { EmailCategory, EmailThreadSummary } from '@/types/email';
import { categoryLabels } from '@/types/email';
import { formatTimestamp } from '@/utils/formatters';

interface CategoryItem {
  key: EmailCategory;
  label: string;
  count: number;
}

interface InboxListProps {
  threads: EmailThreadSummary[];
  activeCategory: EmailCategory;
  categoryItems: CategoryItem[];
  searchText: string;
  selectedThreadId: string | null;
  onCategoryChange: (category: EmailCategory) => void;
  onSearchChange: (value: string) => void;
  onSelectThread: (threadId: string) => void;
  isLoading: boolean;
  isCategoryPending: boolean;
}

export function InboxList({
  threads,
  activeCategory,
  categoryItems,
  searchText,
  selectedThreadId,
  onCategoryChange,
  onSearchChange,
  onSelectThread,
  isLoading,
  isCategoryPending,
}: InboxListProps) {
  return (
    <section className="card inbox-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Smart inbox</p>
          <h2>{categoryLabels[activeCategory]}</h2>
        </div>
        {isCategoryPending ? <span className="status-tag">Refreshing queue...</span> : null}
      </div>

      <div className="category-tabs">
        {categoryItems.map((item) => (
          <button
            key={item.key}
            className={`category-tab ${item.key === activeCategory ? 'active' : ''}`}
            type="button"
            onClick={() => onCategoryChange(item.key)}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </div>

      <label className="search-field">
        <span className="sr-only">Search threads</span>
        <input
          type="search"
          placeholder="Search sender, subject, or topic..."
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <div className="thread-list">
        {isLoading ? <div className="empty-state">Loading inbox threads...</div> : null}

        {!isLoading && threads.length === 0 ? (
          <div className="empty-state">
            No conversations match this queue yet. Try a different search or sync the inbox.
          </div>
        ) : null}

        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className={`thread-list-item ${selectedThreadId === thread.id ? 'active' : ''}`}
            onClick={() => onSelectThread(thread.id)}
          >
            <div className="thread-list-top">
              <div>
                <strong>{thread.senderName}</strong>
                <span>{thread.senderEmail}</span>
              </div>
              <time dateTime={thread.receivedAt}>{formatTimestamp(thread.receivedAt)}</time>
            </div>

            <h3>{thread.subject}</h3>
            <p>{thread.snippet}</p>

            <div className="thread-list-tags">
              <span className={`priority-chip priority-${thread.priority.toLowerCase()}`}>
                {thread.priority}
              </span>
              {thread.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="soft-chip">
                  {tag}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
