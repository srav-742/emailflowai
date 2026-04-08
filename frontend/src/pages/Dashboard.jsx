import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmailCard from '../components/EmailCard';
import StatsOverview from '../components/StatsOverview';

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingAI, setProcessingAI] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchEmails();
    fetchStats();
  }, []);

  const fetchEmails = async () => {
    try {
      const response = await emailAPI.getEmails({ limit: 50 });
      setEmails(response.data.emails);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await emailAPI.getStats();
      setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleProcessAI = async () => {
    try {
      setProcessingAI(true);
      await emailAPI.aiProcessAll();
      await Promise.all([fetchEmails(), fetchStats()]);
    } catch (error) {
      console.error('AI processing error:', error);
    } finally {
      setProcessingAI(false);
    }
  };

  const handleSyncEmails = async () => {
    try {
      setLoading(true);
      await emailAPI.syncEmails();
      await Promise.all([fetchEmails(), fetchStats()]);
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setLoading(false);
    }
  };

  const actionQueue = emails.filter((email) => email.actionRequired || email.priority === 'high');
  const financeQueue = emails.filter((email) => email.category === 'finance');
  const developerQueue = emails.filter((email) => email.category === 'developer');
  const meetingQueue = emails.filter((email) => email.category === 'meetings');
  const newsletters = emails.filter((email) => email.category === 'newsletter');
  const topCategories = [...(stats?.byCategory || [])].sort((left, right) => right.count - left.count).slice(0, 4);
  const lastSyncLabel = user?.lastSyncAt
    ? new Date(user.lastSyncAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'No sync yet';
  const categoryCards = [
    { title: 'Action queue', description: 'Urgent asks and response-required threads.', items: actionQueue.slice(0, 4) },
    { title: 'Finance', description: 'Invoices, approvals, receipts, and payment updates.', items: financeQueue.slice(0, 4) },
    { title: 'Developer', description: 'Builds, deploys, PRs, incidents, and release notes.', items: developerQueue.slice(0, 4) },
    { title: 'Meetings', description: 'Calendar invites, agendas, and follow-up threads.', items: meetingQueue.slice(0, 4) },
  ];

  if (loading) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Loading your inbox command center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <section className="hero-card hero-card-dashboard">
        <div className="hero-copy">
          <span className="eyebrow">Today at a glance</span>
          <h2>{user?.hasGmailAccess ? 'Your inbox is connected and ready for calm, high-signal triage.' : 'Connect Gmail to unlock live inbox intelligence.'}</h2>
          <p>
            EmailFlow groups your work into actionable queues, highlights high-priority threads, and keeps drafts and
            summaries close to the inbox.
          </p>
        </div>

        <div className="hero-metric-cloud">
          <div className="hero-mini-stat">
            <strong>{actionQueue.length}</strong>
            <span>Needs action</span>
          </div>
          <div className="hero-mini-stat">
            <strong>{financeQueue.length}</strong>
            <span>Finance threads</span>
          </div>
          <div className="hero-mini-stat">
            <strong>{developerQueue.length}</strong>
            <span>Developer alerts</span>
          </div>
          <div className="hero-mini-stat">
            <strong>{meetingQueue.length}</strong>
            <span>Meeting emails</span>
          </div>
        </div>

        <div className="hero-actions">
          <button className="button button-primary" onClick={handleSyncEmails} disabled={loading}>
            {user?.hasGmailAccess ? 'Sync Gmail now' : 'Retry sync after Gmail connect'}
          </button>
          <button className="button button-secondary" onClick={handleProcessAI} disabled={processingAI || !emails.length}>
            {processingAI ? 'Processing with AI...' : 'AI process current inbox'}
          </button>
        </div>
      </section>

      {!user?.hasGmailAccess && (
        <section className="surface-card banner-card">
          <div>
            <span className="eyebrow">Connection needed</span>
            <h3>Gmail permission is the last step before live sync.</h3>
            <p>Once connected, EmailFlow can fetch inbox threads, save them to PostgreSQL, and generate summaries and drafts.</p>
          </div>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => navigate('/auth/gmail-connect')}>
              Open Gmail setup
            </button>
          </div>
        </section>
      )}

      <StatsOverview stats={stats} />

      <section className="grid-two">
        <div className="surface-card brief-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Morning brief</span>
              <h3>What deserves your attention first</h3>
            </div>
          </div>

          <div className="brief-grid">
            <article className="brief-stat">
              <strong>{actionQueue.length}</strong>
              <span>Action-required threads</span>
              <p>Emails that look urgent or likely need a reply.</p>
            </article>
            <article className="brief-stat">
              <strong>{newsletters.length}</strong>
              <span>Read-later items</span>
              <p>Low-noise updates you can batch after the priority work.</p>
            </article>
            <article className="brief-stat">
              <strong>{topCategories[0]?.category || 'general'}</strong>
              <span>Top inbox lane</span>
              <p>The busiest category in your current workspace.</p>
            </article>
            <article className="brief-stat">
              <strong>{lastSyncLabel}</strong>
              <span>Last sync</span>
              <p>Your latest successful workspace refresh timestamp.</p>
            </article>
          </div>
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Category mix</span>
              <h3>Where your inbox energy is going</h3>
            </div>
          </div>
          <div className="category-meter-grid">
            {topCategories.map((entry) => (
              <div key={entry.category} className="category-meter">
                <div className="category-meter-top">
                  <strong>{entry.category}</strong>
                  <span>{entry.count}</span>
                </div>
                <div className="category-meter-bar">
                  <span style={{ width: `${Math.min(100, (entry.count / Math.max(stats.totalEmails || 1, 1)) * 100)}%` }}></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Read later</span>
              <h3>Low-noise threads worth batching</h3>
            </div>
          </div>

          <div className="stack-list">
            {newsletters.length ? (
              newsletters.slice(0, 4).map((email) => <EmailCard key={email.id} email={email} compact onUpdate={fetchEmails} />)
            ) : (
              <div className="empty-card">No newsletters or promotional items are waiting right now.</div>
            )}
          </div>
        </div>
      </section>

      <section className="lane-grid">
        {categoryCards.map((card) => (
          <div key={card.title} className="surface-card lane-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{card.title}</span>
                <h3>{card.description}</h3>
              </div>
            </div>

            <div className="stack-list">
              {card.items.length ? (
                card.items.map((email) => <EmailCard key={email.id} email={email} compact onUpdate={fetchEmails} />)
              ) : (
                <div className="empty-card">Nothing is waiting in this lane right now.</div>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );

  /*
  return (
    <div className="dashboard">
      <StatsOverview stats={stats} />

      <div className="dashboard-actions">
        <button className="action-btn primary" onClick={handleSyncEmails} disabled={loading}>
          🔄 Sync Gmail
        </button>
        <button className="action-btn secondary" onClick={handleProcessAI} disabled={processingAI}>
          🤖 {processingAI ? 'Processing with AI...' : 'AI Process All'}
        </button>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-section">
          <div className="section-header">
            <h2>🔥 Focus Today</h2>
            <span className="count-badge">{focusToday.length}</span>
          </div>
          <div className="email-list">
            {focusToday.length > 0 ? (
              focusToday.slice(0, 5).map(email => (
                <EmailCard key={email.id} email={email} onUpdate={fetchEmails} />
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">✨</div>
                <p>No high priority emails</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2>📖 Read Later</h2>
            <span className="count-badge">{readLater.length}</span>
          </div>
          <div className="email-list">
            {readLater.length > 0 ? (
              readLater.slice(0, 5).map(email => (
                <EmailCard key={email.id} email={email} onUpdate={fetchEmails} />
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>No emails to read later</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2>⏳ Waiting for Reply</h2>
            <span className="count-badge">{waitingReply.length}</span>
          </div>
          <div className="email-list">
            {waitingReply.length > 0 ? (
              waitingReply.slice(0, 5).map(email => (
                <EmailCard key={email.id} email={email} onUpdate={fetchEmails} />
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">✉️</div>
                <p>No emails waiting for reply</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-section">
          <div className="section-header">
            <h2>📰 Newsletters</h2>
            <span className="count-badge">{newsletters.length}</span>
          </div>
          <div className="email-list">
            {newsletters.length > 0 ? (
              newsletters.slice(0, 5).map(email => (
                <EmailCard key={email.id} email={email} onUpdate={fetchEmails} />
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>No newsletters</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  */
};

export default Dashboard;
