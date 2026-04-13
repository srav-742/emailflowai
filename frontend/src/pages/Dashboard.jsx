import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI, emailAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmailCard from '../components/EmailCard';
import StatsOverview from '../components/StatsOverview';
import { connectSocket, disconnectSocket } from '../services/socket';

const sortByNewest = (items) =>
  [...items].sort((left, right) => {
    const leftDate = new Date(left.receivedAt || left.createdAt || 0).getTime();
    const rightDate = new Date(right.receivedAt || right.createdAt || 0).getTime();
    return rightDate - leftDate;
  });

const mergeIncomingEmails = (currentEmails, incomingEmails) => {
  const merged = new Map();

  sortByNewest([...incomingEmails, ...currentEmails]).forEach((email) => {
    merged.set(email.id, email);
  });

  return Array.from(merged.values());
};

const mapTaskPriorityTone = (priority) => {
  if (priority === 'high') {
    return 'high';
  }

  if (priority === 'low') {
    return 'low';
  }

  return 'normal';
};

const formatDateTime = (value, fallback = 'Not available yet') =>
  value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : fallback;

const getFollowUpContact = (email) => email.recipients?.[0] || email.senderName || email.sender || 'this contact';

const Dashboard = () => {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);
  const [trainingStyle, setTrainingStyle] = useState(false);
  const [stats, setStats] = useState(null);
  const [brief, setBrief] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [notice, setNotice] = useState(null);
  const [inboxSummary, setInboxSummary] = useState(null); // AI batch summary
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [liveSync, setLiveSync] = useState({
    connected: false,
    lastReceivedAt: null,
    newCount: 0,
  });

  const fetchEmails = useCallback(async () => {
    try {
      const response = await emailAPI.getEmails({ limit: 50 });
      const nextEmails = sortByNewest(response.data.emails || []);
      setEmails(nextEmails);
      return nextEmails;
    } catch (error) {
      console.error('Failed to fetch emails:', error);
      return [];
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await emailAPI.getStats();
      setStats(response.data.stats);
      return response.data.stats;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      return null;
    }
  }, []);

  const fetchMorningBrief = useCallback(async () => {
    try {
      const response = await aiAPI.getMorningBrief();
      setBrief(response.data.brief);
      return response.data.brief;
    } catch (error) {
      console.error('Failed to fetch morning brief:', error);
      return null;
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await aiAPI.getAnalytics();
      setAnalytics(response.data.stats);
      return response.data.stats;
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      return null;
    }
  }, []);

  const fetchInboxSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const response = await aiAPI.getInboxSummary(20);
      setInboxSummary(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch inbox summary:', error);
      return null;
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const refreshEmailInsights = useCallback(async () => {
    await Promise.all([fetchEmails(), fetchStats(), fetchMorningBrief(), fetchAnalytics(), fetchInboxSummary()]);
  }, [fetchAnalytics, fetchEmails, fetchMorningBrief, fetchStats, fetchInboxSummary]);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([refreshEmailInsights(), refreshProfile()]);
  }, [refreshEmailInsights, refreshProfile]);

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      setLoading(true);
      await Promise.allSettled([fetchEmails(), fetchStats(), fetchMorningBrief(), fetchAnalytics(), fetchInboxSummary(), refreshProfile()]);

      if (active) {
        setLoading(false);
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [fetchAnalytics, fetchEmails, fetchInboxSummary, fetchMorningBrief, fetchStats, refreshProfile]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWorkspace();
    }, 20 * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!user?.id || !user?.hasGmailAccess) {
      setLiveSync({
        connected: false,
        lastReceivedAt: null,
        newCount: 0,
      });
      return undefined;
    }

    const socket = connectSocket(user.id);
    if (!socket) {
      return undefined;
    }

    const handleConnect = () => {
      setLiveSync((current) => ({
        ...current,
        connected: true,
      }));
    };

    const handleDisconnect = () => {
      setLiveSync((current) => ({
        ...current,
        connected: false,
      }));
    };

    const handleNewEmails = (incomingEmails = []) => {
      if (!Array.isArray(incomingEmails) || incomingEmails.length === 0) {
        return;
      }

      setEmails((currentEmails) => mergeIncomingEmails(currentEmails, incomingEmails));
      setLiveSync({
        connected: socket.connected,
        lastReceivedAt: new Date().toISOString(),
        newCount: incomingEmails.length,
      });
      setNotice({
        tone: 'ok',
        text: `${incomingEmails.length} new email${incomingEmails.length > 1 ? 's were' : ' was'} saved and analyzed automatically.`,
      });

      void Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics(), refreshProfile()]);
    };

    const handleInboxSummary = (data) => {
      if (data?.summary) {
        setInboxSummary(data);
      }
    };

    const handleImportantEmail = (email) => {
      setNotice({
        tone: 'warn',
        text: `Urgent email detected: ${email.subject || 'Untitled email'} from ${email.senderName || email.sender || 'Unknown sender'}.`,
      });
      void Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics()]);
    };

    const handleFollowUpReady = (followUps = []) => {
      const count = Array.isArray(followUps) ? followUps.length : 0;
      if (count > 0) {
        setNotice({
          tone: 'warn',
          text: `${count} follow-up reminder${count > 1 ? 's are' : ' is'} ready for review.`,
        });
      }
      void Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics()]);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new-emails', handleNewEmails);
    socket.on('inbox-summary', handleInboxSummary);
    socket.on('important-email', handleImportantEmail);
    socket.on('follow-up-ready', handleFollowUpReady);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new-emails', handleNewEmails);
      socket.off('inbox-summary', handleInboxSummary);
      socket.off('important-email', handleImportantEmail);
      socket.off('follow-up-ready', handleFollowUpReady);
      disconnectSocket();
    };
  }, [fetchAnalytics, fetchMorningBrief, fetchStats, refreshProfile, user?.hasGmailAccess, user?.id]);

  const handleProcessAI = async () => {
    try {
      setProcessingAI(true);
      const response = await emailAPI.aiProcessAll();
      setNotice({
        tone: 'ok',
        text: response.data.message || 'AI finished processing your inbox.',
      });
      await Promise.all([fetchEmails(), fetchStats(), fetchMorningBrief(), fetchAnalytics(), refreshProfile()]);
    } catch (error) {
      console.error('AI processing error:', error);
      setNotice({
        tone: 'warn',
        text: error.response?.data?.error || 'AI processing could not finish right now.',
      });
    } finally {
      setProcessingAI(false);
    }
  };

  const handleSyncEmails = async () => {
    try {
      setSyncing(true);
      const response = await emailAPI.syncEmails();
      setEmails(sortByNewest(response.data.emails || []));
      setNotice({
        tone: response.data.degraded ? 'warn' : 'ok',
        text:
          response.data.warning ||
          response.data.message ||
          `${response.data.newCount || 0} new email${response.data.newCount === 1 ? '' : 's'} synced successfully.`,
      });
      await Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics(), refreshProfile()]);
    } catch (error) {
      console.error('Sync error:', error);
      setNotice({
        tone: 'warn',
        text: error.response?.data?.error || 'Unable to sync Gmail right now. Your saved inbox is still available.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleTrainStyle = async () => {
    try {
      setTrainingStyle(true);
      const response = await aiAPI.trainStyle();
      await refreshProfile();
      setNotice({
        tone: response.data.ready ? 'ok' : 'warn',
        text: response.data.message,
      });
    } catch (error) {
      console.error('Style training error:', error);
      setNotice({
        tone: 'warn',
        text: error.response?.data?.error || 'Writing style could not be trained right now.',
      });
    } finally {
      setTrainingStyle(false);
    }
  };

  const actionQueue = emails.filter((email) => email.actionRequired || email.priority === 'high');
  const financeQueue = emails.filter((email) => email.category === 'finance');
  const developerQueue = emails.filter((email) => email.category === 'developer');
  const meetingQueue = emails.filter((email) => email.category === 'meetings');
  const newsletters = emails.filter((email) => email.category === 'newsletter');
  const pendingTasks = emails
    .flatMap((email) =>
      Array.isArray(email.tasks)
        ? email.tasks.map((task, index) => ({
          ...task,
          emailId: email.id,
          emailSubject: email.subject || 'Untitled email',
          emailSender: email.senderName || email.sender || 'Unknown sender',
          taskKey: `${email.id}-${task.id || index}`,
        }))
        : [],
    )
    .filter((task) => !task.completed);
  const topCategories = [...(stats?.byCategory || [])].sort((left, right) => right.count - left.count).slice(0, 4);
  const lastSyncLabel = formatDateTime(user?.lastSyncAt, 'No sync yet');
  const lastLiveUpdateLabel = formatDateTime(liveSync.lastReceivedAt, 'Waiting for the next incoming email');
  const urgentEmails = brief?.importantEmails?.length ? brief.importantEmails : actionQueue.slice(0, 4);
  const followUpEmails = brief?.followUps?.length ? brief.followUps : emails.filter((email) => email.followUp).slice(0, 6);
  const visibleTasks = brief?.tasks?.length ? brief.tasks : pendingTasks.slice(0, 6);
  const analyticsCategories = [...(analytics?.byCategory || topCategories)].sort((left, right) => right.count - left.count).slice(0, 4);
  const recentAI = analytics?.recentAI || [];
  const styleProfile = user?.style || null;
  const styleReady = Boolean(styleProfile?.ready);
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
          <span className="eyebrow">Step 1 · Understand today</span>
          <h2>{user?.hasGmailAccess ? 'Your inbox is organized into clear steps so the next action is easy to spot.' : 'Connect Gmail to unlock automatic inbox analysis and guided triage.'}</h2>
          <p>
            EmailFlow brings summaries, urgency, follow-ups, tasks, and reply drafts into one calm workspace so users can
            understand each email faster.
          </p>
        </div>

        <div className="hero-metric-cloud">
          <div className="hero-mini-stat">
            <strong>{actionQueue.length}</strong>
            <span>Needs action</span>
          </div>
          <div className="hero-mini-stat">
            <strong>{pendingTasks.length}</strong>
            <span>Open tasks</span>
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
          <button className="button button-primary" onClick={handleSyncEmails} disabled={syncing}>
            {syncing ? 'Syncing Gmail...' : user?.hasGmailAccess ? 'Sync Gmail now' : 'Retry sync after Gmail connect'}
          </button>
          <button className="button button-secondary" onClick={handleProcessAI} disabled={processingAI || !emails.length}>
            {processingAI ? 'Processing with AI...' : 'AI process current inbox'}
          </button>
          <button className="button button-ghost" onClick={handleTrainStyle} disabled={trainingStyle}>
            {trainingStyle ? 'Training style...' : 'Train my writing style'}
          </button>
        </div>
      </section>

      <section className="surface-card live-sync-card" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(168,85,247,0.15) 100%)', border: '1px solid rgba(168,85,247,0.3)' }}>
        <div>
          <span className="eyebrow" style={{ color: '#a78bfa' }}>🤖 AI Inbox Intelligence · Powered by Groq</span>
          <h3 style={{ color: '#e2e8f0', marginBottom: '0.75rem' }}>
            {loadingSummary ? 'Analyzing your inbox with AI...' : inboxSummary?.summary ? 'Your inbox at a glance' : 'AI summary will appear after your first email sync'}
          </h3>
          {loadingSummary ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#94a3b8' }}>
              <div className="app-loading-spinner" style={{ width: '1.2rem', height: '1.2rem', borderWidth: '2px' }}></div>
              <span>Groq is reading your latest {emails.length} email{emails.length !== 1 ? 's' : ''}...</span>
            </div>
          ) : inboxSummary?.summary ? (
            <>
              <p style={{ color: '#cbd5e1', lineHeight: 1.7, marginBottom: '1rem', fontSize: '0.97rem' }}>
                {inboxSummary.summary}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span className="status-pill status-ok">📊 {inboxSummary.emailCount || emails.length} emails analyzed</span>
                {inboxSummary.generatedAt && (
                  <span className="status-pill">🕒 {new Date(inboxSummary.generatedAt).toLocaleTimeString([], { timeStyle: 'short' })}</span>
                )}
                {inboxSummary.emails && inboxSummary.emails.some(e => e.priority === 'high') && (
                  <span className="status-pill status-warn">🔴 Urgent emails detected</span>
                )}
              </div>
              {Array.isArray(inboxSummary.emails) && inboxSummary.emails.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {inboxSummary.emails.slice(0, 5).map((e) => (
                    <div key={e.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                      <span className={`mail-pill ${e.priority === 'high' ? 'high' : e.priority === 'low' ? 'low' : 'normal'}`} style={{ flexShrink: 0, marginTop: '0.1rem' }}>{e.priority || 'normal'}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.subject || 'No Subject'}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.78rem' }}>from {e.sender} · {e.category}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ color: '#64748b' }}>Sync your Gmail to generate an AI summary of all your latest emails at once.</p>
          )}
        </div>
        <div className="live-sync-strip" style={{ marginTop: '1rem' }}>
          <button
            className="button button-secondary"
            onClick={fetchInboxSummary}
            disabled={loadingSummary || !emails.length}
            style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
          >
            {loadingSummary ? 'Analyzing...' : '🔄 Refresh AI Summary'}
          </button>
        </div>
      </section>

      <section className="surface-card live-sync-card">
        <div>
          <span className="eyebrow">Step 2 · Keep inbox current</span>
          <h3>{user?.hasGmailAccess ? 'Live sync keeps this workspace updated automatically.' : 'Connect Gmail to turn on realtime inbox updates.'}</h3>
          <p>
            {liveSync.newCount > 0
              ? `${liveSync.newCount} new email${liveSync.newCount > 1 ? 's were' : ' was'} added automatically and task extraction ran during sync.`
              : 'Socket.IO keeps this view fresh, and new tasks and urgent alerts appear as soon as incoming email is saved.'}
          </p>
        </div>

        <div className="live-sync-strip">
          <span className={`status-pill ${liveSync.connected ? 'status-ok' : 'status-warn'}`}>
            {liveSync.connected ? 'Live sync active' : user?.hasGmailAccess ? 'Reconnecting' : 'Gmail not connected'}
          </span>
          <span className="status-pill">Last live update: {lastLiveUpdateLabel}</span>
        </div>
      </section>

      {notice?.text ? (
        <section className="surface-card banner-card">
          <div>
            <span className="eyebrow">Step 2 · Workspace update</span>
            <h3>{notice.tone === 'warn' ? 'Attention needed' : 'Everything is flowing'}</h3>
            <p>{notice.text}</p>
          </div>
          <div className="live-sync-strip">
            <span className={`status-pill ${notice.tone === 'warn' ? 'status-warn' : 'status-ok'}`}>
              {notice.tone === 'warn' ? 'Review now' : 'Up to date'}
            </span>
          </div>
        </section>
      ) : null}

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
              <span className="eyebrow">📊 Morning Brief</span>
              <h3>{brief?.headline || 'What deserves your attention first'}</h3>
            </div>
          </div>

          <p style={{ marginBottom: '1.2rem' }}>{brief?.summary || 'Your dashboard will summarize urgent emails, follow-ups, and task load here as soon as enough inbox data is available.'}</p>

          <div className="brief-grid">
            <article className="brief-stat">
              <strong>{brief?.counts?.important ?? actionQueue.length}</strong>
              <span>🔴 Urgent emails</span>
              <p>Threads that look high priority or likely need a quick response.</p>
            </article>
            <article className="brief-stat">
              <strong>{brief?.counts?.tasks ?? pendingTasks.length}</strong>
              <span>✅ Open tasks</span>
              <p>Action items the system extracted from incoming emails.</p>
            </article>
            <article className="brief-stat">
              <strong>{brief?.counts?.followUps ?? followUpEmails.length}</strong>
              <span>🔄 Follow-ups</span>
              <p>Sent conversations that look ready for a polite nudge.</p>
            </article>
            <article className="brief-stat">
              <strong>{lastSyncLabel}</strong>
              <span>🕒 Last sync</span>
              <p>Your latest successful workspace refresh timestamp.</p>
            </article>
          </div>

          {urgentEmails.length > 0 && (
            <>
              <div className="section-heading" style={{ marginTop: '1.5rem' }}>
                <div>
                  <span className="eyebrow">🚨 Urgent Emails</span>
                </div>
              </div>
              <div className="stack-list">
                {urgentEmails.slice(0, 3).map((email) => <EmailCard key={email.id} email={email} compact onUpdate={refreshWorkspace} />)}
              </div>
            </>
          )}
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">✍️ Writing Style</span>
              <h3>{styleReady ? 'Replies are learning your voice' : 'Teach the assistant how you naturally write'}</h3>
            </div>
          </div>

          <p style={{ marginBottom: '1.2rem' }}>
            {styleReady
              ? styleProfile.styleSummary || 'Your assistant is shaping replies to match your real writing style.'
              : `Train after at least ${styleProfile?.minSamples || 5} sent emails so replies sound more like you.`}
          </p>

          <div className="brief-grid">
            <article className="brief-stat">
              <strong>{styleProfile?.sampleCount ?? 0}</strong>
              <span>Training samples</span>
              <p>Sent emails and edited replies currently available for learning.</p>
            </article>
            <article className="brief-stat">
              <strong>{styleProfile?.tone || 'Not trained'}</strong>
              <span>Tone</span>
              <p>{styleProfile?.greetingStyle || 'Train style to detect your preferred opening.'}</p>
            </article>
            <article className="brief-stat">
              <strong>{styleProfile?.sentenceLength || 'Not trained'}</strong>
              <span>Sentence length</span>
              <p>{styleProfile?.signatureStyle || 'Train style to learn your sign-off style.'}</p>
            </article>
            <article className="brief-stat">
              <strong>{styleProfile?.updatedAt ? formatDateTime(styleProfile.updatedAt) : 'Pending'}</strong>
              <span>Last trained</span>
              <p>{styleReady ? 'Updated from your sent mail history.' : 'Send or edit more replies, then train again.'}</p>
            </article>
          </div>

          {Array.isArray(styleProfile?.commonPhrases) && styleProfile.commonPhrases.length > 0 && (
            <>
              <div className="section-heading" style={{ marginTop: '1.5rem' }}>
                <div>
                  <span className="eyebrow">Common Phrases</span>
                </div>
              </div>
              <div className="stack-list">
                {styleProfile.commonPhrases.map((phrase) => (
                  <article key={phrase} className="task-row">
                    <div className="task-row-top">
                      <strong>{phrase}</strong>
                      <span className="mail-label">Common phrase</span>
                    </div>
                    <p>The assistant can echo this phrasing naturally in future drafts when it fits.</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">📈 Analytics</span>
              <h3>How the assistant is helping across your inbox</h3>
            </div>
          </div>

          <div className="brief-grid" style={{ marginBottom: '1.5rem' }}>
            <article className="brief-stat">
              <strong>{analytics?.emailsProcessed ?? 0}</strong>
              <span>Emails processed</span>
              <p>Messages that have flowed through sync and structured storage.</p>
            </article>
            <article className="brief-stat">
              <strong>{analytics?.aiActions ?? 0}</strong>
              <span>AI actions</span>
              <p>Summaries, classifications, task extractions, and reply drafts generated.</p>
            </article>
            <article className="brief-stat">
              <strong>{analytics?.timeSaved ?? 0} min</strong>
              <span>Estimated time saved</span>
              <p>A running estimate based on automated triage and drafting assistance.</p>
            </article>
            <article className="brief-stat">
              <strong>{analytics?.followUpCount ?? stats?.followUpCount ?? 0}</strong>
              <span>Active follow-ups</span>
              <p>Reminders currently waiting in the follow-up queue.</p>
            </article>
          </div>

          {analyticsCategories.length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: '1rem' }}>
                <div>
                  <span className="eyebrow">Email Categories</span>
                </div>
              </div>
              <div className="category-meter-grid" style={{ marginBottom: '1.5rem' }}>
                {analyticsCategories.map((entry) => (
                  <div key={entry.category} className="category-meter">
                    <div className="category-meter-top">
                      <strong>{entry.category}</strong>
                      <span>{entry.count}</span>
                    </div>
                    <div className="category-meter-bar">
                      <span style={{ width: `${Math.min(100, (entry.count / Math.max(analytics?.totalEmails || stats?.totalEmails || 1, 1)) * 100)}%` }}></span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {recentAI.length > 0 && (
            <>
              <div className="section-heading" style={{ marginBottom: '1rem' }}>
                <div>
                  <span className="eyebrow">Recent AI Activity</span>
                </div>
              </div>
              <div className="stack-list">
                {recentAI.map((entry, index) => (
                  <article key={`${entry.actionType}-${entry.createdAt}-${index}`} className="task-row">
                    <div className="task-row-top">
                      <strong>{entry.actionType.replace(/_/g, ' ')}</strong>
                      <span className="mail-label">{entry.model || 'assistant'}</span>
                    </div>
                    <p>{formatDateTime(entry.createdAt)}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">🔄 Follow-up Queue</span>
              <h3>Sent conversations that look ready for a reminder</h3>
            </div>
          </div>

          <div className="task-list">
            {followUpEmails.length > 0 ? (
              followUpEmails.slice(0, 6).map((email) => (
                <article key={email.id} className="task-row">
                  <div className="task-row-top">
                    <strong>Follow up with {getFollowUpContact(email)}</strong>
                    <span className="mail-pill high">needs reply</span>
                  </div>
                  <div className="task-meta-row">
                    <span className="mail-label">{email.subject || 'Untitled thread'}</span>
                    <span className="mail-label">{formatDateTime(email.followUpAt || email.receivedAt)}</span>
                  </div>
                  <p>{email.summary || email.snippet || 'This thread has been quiet long enough to deserve a check-in.'}</p>
                </article>
              ))
            ) : (
              <div className="empty-card">
                <h3>No follow-ups pending</h3>
                <p>No follow-up reminders are pending right now.</p>
              </div>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">✅ Task Board</span>
              <h3>Action items pulled directly from incoming emails</h3>
            </div>
          </div>

          <div className="task-list">
            {visibleTasks.length > 0 ? (
              visibleTasks.map((task) => (
                <article key={task.taskKey} className="task-row">
                  <div className="task-row-top">
                    <strong>{task.task}</strong>
                    <span className={`mail-pill ${mapTaskPriorityTone(task.priority)}`}>{task.priority || 'medium'}</span>
                  </div>
                  <div className="task-meta-row">
                    <span className="mail-label">{task.deadline || 'No deadline detected'}</span>
                    <span className="mail-label">{task.emailSender || task.contact || 'Unknown sender'}</span>
                  </div>
                  <p>{task.emailSubject}</p>
                </article>
              ))
            ) : (
              <div className="empty-card">
                <h3>No tasks extracted</h3>
                <p>Sync Gmail or run AI processing to build your task queue.</p>
              </div>
            )}
          </div>
        </div>

        <div className="surface-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">📰 Read Later</span>
              <h3>Low-noise threads worth batching</h3>
            </div>
          </div>

          <div className="stack-list">
            {newsletters.length > 0 ? (
              newsletters.slice(0, 4).map((email) => <EmailCard key={email.id} email={email} compact onUpdate={refreshWorkspace} />)
            ) : (
              <div className="empty-card">
                <h3>No newsletters</h3>
                <p>No newsletters or promotional items are waiting right now.</p>
              </div>
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
                card.items.map((email) => <EmailCard key={email.id} email={email} compact onUpdate={refreshWorkspace} />)
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
