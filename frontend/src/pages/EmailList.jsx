import { useState, useEffect, useCallback } from 'react';
import { emailAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useEmailStore } from '../store/emailStore';
import { useSSE } from '../hooks/useSSE';
import EmailCard from '../components/EmailCard';
import ThreadView from '../components/ThreadView';
import ThreadCard from '../components/ThreadCard';
import InboxTabs from '../components/InboxTabs';
import { connectSocket } from '../services/socket';
import './EmailList.css';
import './InboxTabs.css';

const EmailList = ({ filter = {}, title = 'Inbox command center', description = 'Review and process every thread in one place.' }) => {
  const { user, token } = useAuth();
  const emails = useEmailStore((state) => state.emails);
  const setEmails = useEmailStore((state) => state.setEmails);
  const loading = useEmailStore((state) => state.loading);
  const setLoading = useEmailStore((state) => state.setLoading);

  const [query, setQuery] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState('focus_today');
  const [liveMessage, setLiveMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'threads'
  const [selectedThreadId, setSelectedThreadId] = useState(null);

  // 1. Activate real-time SSE stream
  useSSE(token);

  const fetchEmails = useCallback(async (reset = false) => {
    try {
      setLoading(reset);
      const currentCursor = reset ? null : cursor;
      const params = {
        limit: pagination.limit,
        cursor: currentCursor,
        category: activeTab,
        ...(query ? { q: query } : {}),
      };

      let response;
      if (query) {
        response = await emailAPI.searchEmails(params);
      } else if (viewMode === 'threads') {
        response = await emailAPI.getThreads(params);
      } else {
        response = await emailAPI.getEmails(params);
      }

      const data = response.data || {};
      const newEmails = data.emails || [];
      
      if (reset) {
        setEmails(newEmails);
      } else {
        setEmails([...emails, ...newEmails]);
      }

      setCursor(data.pagination?.nextCursor || null);
      setHasMore(Boolean(data.pagination?.nextCursor));
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, cursor, emails, pagination.limit, query, setEmails, setLoading, viewMode]);

  useEffect(() => {
    fetchEmails(true);
  }, [activeTab, query, viewMode]);

  // 2. Fallback: Socket.IO for older browser support or specific event types
  useEffect(() => {
    if (!user?.id || !user?.hasGmailAccess) {
      return undefined;
    }

    const socket = connectSocket(user.id);
    if (!socket) {
      return undefined;
    }

    const handleNewEmails = (incomingEmails = []) => {
      // With Zustand + SSE, we only use this as a trigger for a full refresh 
      // if needed, or to show a notification message.
      const count = Array.isArray(incomingEmails) ? incomingEmails.length : 0;
      setLiveMessage(count ? `${count} new email${count > 1 ? 's' : ''} arrived.` : 'Inbox updated.');
    };

    socket.on('new-emails', handleNewEmails);

    return () => {
      socket.off('new-emails', handleNewEmails);
      // disconnectSocket(); // Keep active for other components
    };
  }, [user?.hasGmailAccess, user?.id]);

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleSync = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.syncEmails();
      setSyncMessage(response.data.warning || response.data.message || 'Inbox synced successfully.');
      await fetchEmails();
    } catch (error) {
      console.error('Failed to sync emails:', error);
      setSyncMessage(error.response?.data?.error || 'Unable to sync Gmail right now. Your saved inbox is still available.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Loading emails...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="list-shell">
      <div className="surface-card toolbar-card">
        <div>
          <span className="eyebrow">Inbox lane</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search subject, sender, or snippet"
            value={query}
            onChange={(event) => {
              setPagination((prev) => ({ ...prev, page: 1 }));
              setQuery(event.target.value);
            }}
          />
          <div className="view-toggle">
            <button 
              className={`button ${viewMode === 'list' ? 'button-secondary' : 'button-ghost'}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
            <button 
              className={`button ${viewMode === 'threads' ? 'button-secondary' : 'button-ghost'}`}
              onClick={() => setViewMode('threads')}
            >
              Threads
            </button>
          </div>
          <button className="button button-secondary" onClick={handleSync}>
            Sync now
          </button>
        </div>
      </div>

      <div className="list-summary-row">
        <span className="status-pill status-ok">Showing {emails.length} of {pagination.total} emails</span>
        {liveMessage ? <span className="status-pill">{liveMessage}</span> : null}
        {syncMessage ? (
          <span className={`status-pill ${/unable|unavailable|failed/i.test(syncMessage) ? 'status-warn' : 'status-ok'}`}>{syncMessage}</span>
        ) : null}
      </div>

      <InboxTabs 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          setCursor(null);
        }} 
      />

      <div className="stack-list">
        {selectedThreadId ? (
          <ThreadView 
            threadId={selectedThreadId} 
            onBack={() => setSelectedThreadId(null)} 
          />
        ) : (
          <>
            {emails.length > 0 ? (
              emails.map((item) => {
                if (viewMode === 'threads') {
                  return (
                    <ThreadCard 
                      key={item.id || item.threadId} 
                      thread={item} 
                      onClick={() => setSelectedThreadId(item.id || item.threadId)}
                    />
                  );
                }
                return (
                  <EmailCard 
                    key={item.id} 
                    email={item} 
                    onUpdate={() => fetchEmails(true)} 
                    onThreadClick={item.threadId ? () => setSelectedThreadId(item.threadId) : null}
                    isThreadHead={viewMode === 'threads'}
                  />
                );
              })
            ) : (
              <div className="empty-card">
                <h3>No emails matched this view.</h3>
                <p>Try another category, adjust the search query, or run a new Gmail sync.</p>
              </div>
            )}
          </>
        )}
      </div>

      {hasMore && !selectedThreadId && (
        <div className="pagination-row">
          <button className="button button-ghost" onClick={() => fetchEmails(false)}>
            Load more emails
          </button>
        </div>
      )}
    </div>
  );

  /*
  return (
    <div className="email-list-page">
      <div className="email-count">
        <p>Showing {emails.length} of {pagination.total} emails</p>
      </div>

      <div className="email-list-container">
        {emails.length > 0 ? (
          emails.map(email => (
            <EmailCard key={email.id} email={email} onUpdate={fetchEmails} />
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No emails found</h3>
            <p>Try syncing your Gmail account</p>
          </div>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="pagination">
          <button 
            className="page-btn"
            disabled={pagination.page === 1}
            onClick={() => handlePageChange(pagination.page - 1)}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button 
            className="page-btn"
            disabled={pagination.page >= pagination.pages}
            onClick={() => handlePageChange(pagination.page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
  */
};

export default EmailList;
