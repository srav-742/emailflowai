import { useState, useEffect, useCallback } from 'react';
import { emailAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmailCard from '../components/EmailCard';
import { connectSocket, disconnectSocket } from '../services/socket';
import './EmailList.css';

const EmailList = ({ filter = {}, title = 'Inbox command center', description = 'Review and process every thread in one place.' }) => {
  const { user } = useAuth();
  const [emails, setEmails] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [liveMessage, setLiveMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.priority ? { priority: filter.priority } : {}),
        ...(query ? { q: query } : {}),
      };
      const response = await emailAPI.getEmails(params);
      setEmails(response.data.emails);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination.total,
        pages: response.data.pagination.pages,
      }));
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  }, [filter.category, filter.priority, pagination.limit, pagination.page, query]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    if (!user?.id || !user?.hasGmailAccess) {
      return undefined;
    }

    const socket = connectSocket(user.id);
    if (!socket) {
      return undefined;
    }

    const handleNewEmails = (incomingEmails = []) => {
      const count = Array.isArray(incomingEmails) ? incomingEmails.length : 0;
      setLiveMessage(count ? `${count} new email${count > 1 ? 's' : ''} arrived just now.` : 'Inbox updated.');
      void fetchEmails();
    };

    socket.on('new-emails', handleNewEmails);

    return () => {
      socket.off('new-emails', handleNewEmails);
      disconnectSocket();
    };
  }, [fetchEmails, user?.hasGmailAccess, user?.id]);

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

      <div className="stack-list">
        {emails.length > 0 ? (
          emails.map((email) => <EmailCard key={email.id} email={email} onUpdate={fetchEmails} />)
        ) : (
          <div className="empty-card">
            <h3>No emails matched this view.</h3>
            <p>Try another category, adjust the search query, or run a new Gmail sync.</p>
          </div>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="pagination-row">
          <button className="button button-ghost" disabled={pagination.page === 1} onClick={() => handlePageChange(pagination.page - 1)}>
            Previous
          </button>
          <span className="pagination-info">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button className="button button-ghost" disabled={pagination.page >= pagination.pages} onClick={() => handlePageChange(pagination.page + 1)}>
            Next
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
