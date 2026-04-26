import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI, emailAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmailCard from '../components/EmailCard';
import ActionItemsPanel from '../components/ActionItemsPanel';
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

const Dashboard = () => {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);
  const [trainingStyle, setTrainingStyle] = useState(false);
  const [notice, setNotice] = useState(null);
  const [inboxSummary, setInboxSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [stats, setStats] = useState({ totalEmails: 0, unreadCount: 0, actionRequired: 0, followUpCount: 0 });

  const currentStep = useMemo(() => {
    if (!user?.hasGmailAccess) return 1;
    if (emails.length === 0) return 2;
    if (!user?.style?.ready) return 3;
    return 4;
  }, [user?.hasGmailAccess, emails.length, user?.style?.ready]);

  const fetchEmails = useCallback(async () => {
    try {
      const response = await emailAPI.getEmails({ limit: 50 });
      const data = response.data || {};
      const nextEmails = sortByNewest(data.emails || []);
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
      const data = response.data || {};
      if (data.stats) setStats(data.stats);
      return data.stats;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      return null;
    }
  }, []);

  const fetchInboxSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const response = await aiAPI.getInboxSummary(35);
      const data = response.data || {};
      setInboxSummary(data);
      return data;
    } catch (error) {
      console.error('Failed to fetch inbox summary:', error);
      return null;
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const refreshWorkspace = useCallback(async () => {
    await Promise.all([fetchEmails(), fetchStats(), fetchInboxSummary(), refreshProfile()]);
  }, [fetchEmails, fetchStats, fetchInboxSummary, refreshProfile]);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);
      await Promise.allSettled([fetchEmails(), fetchStats(), fetchInboxSummary(), refreshProfile()]);
      if (active) setLoading(false);
    };
    void loadDashboard();
    return () => { active = false; };
  }, [fetchEmails, fetchInboxSummary, fetchStats, refreshProfile]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWorkspace();
    }, 20 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!user?.id || !user?.hasGmailAccess) return undefined;

    const socket = connectSocket(user.id);
    if (!socket) return undefined;

    const handleNewEmails = (incomingEmails = []) => {
      if (!Array.isArray(incomingEmails) || incomingEmails.length === 0) return;
      setEmails((currentEmails) => mergeIncomingEmails(currentEmails, incomingEmails));
      setNotice({ tone: 'ok', text: `${incomingEmails.length} new email(s) analyzed.` });
      void Promise.all([fetchStats(), fetchInboxSummary(), refreshProfile()]);
    };

    const handleInboxSummary = (data) => { if (data?.executive_summary) setInboxSummary(data); };

    socket.on('new-emails', handleNewEmails);
    socket.on('inbox-summary', handleInboxSummary);

    return () => {
      socket.off('new-emails', handleNewEmails);
      socket.off('inbox-summary', handleInboxSummary);
      disconnectSocket();
    };
  }, [fetchInboxSummary, fetchStats, refreshProfile, user?.hasGmailAccess, user?.id]);

  const handleProcessAI = async () => {
    try {
      setProcessingAI(true);
      setNotice({ tone: 'ok', text: 'Running full AI intelligence scan...' });
      await emailAPI.aiProcessAll();
      await refreshWorkspace();
      setNotice({ tone: 'ok', text: 'Intelligence scan complete.' });
    } catch (error) {
      setNotice({ tone: 'warn', text: 'AI scan failed.' });
    } finally {
      setProcessingAI(false);
    }
  };

  const handleSyncEmails = async () => {
    try {
      setSyncing(true);
      await emailAPI.syncEmails();
      await refreshWorkspace();
      setNotice({ tone: 'ok', text: 'Inbox synced successfully.' });
    } catch (error) {
      setNotice({ tone: 'warn', text: 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleTrainStyle = async () => {
    try {
      setTrainingStyle(true);
      const response = await aiAPI.trainStyle();
      await refreshProfile();
      setNotice({ tone: response.data.ready ? 'ok' : 'warn', text: response.data.message });
    } catch (error) {
      setNotice({ tone: 'warn', text: 'Training failed.' });
    } finally {
      setTrainingStyle(false);
    }
  };

  const actionQueue = emails.filter((email) => email.actionRequired || email.priority === 'high');
    
  if (loading) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Analyzing your inbox architecture...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <span className="eyebrow">Executive Workspace</span>
          <h1 style={{ fontSize: '2.4rem' }}>Intelligence Dashboard</h1>
        </div>
        {notice && (
          <div className={`status-pill ${notice.tone === 'ok' ? 'status-ok' : 'status-warn'}`}>
            {notice.text}
          </div>
        )}
      </div>

      <div className="bento-grid" style={{ marginBottom: '2rem' }}>
        <div className="bento-col-4">
          <div className="surface-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="brand-mark" style={{ background: 'var(--highlight)' }}>Σ</div>
            <div>
              <span className="eyebrow">Total Inbox</span>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>{stats.totalEmails || 0}</h2>
            </div>
          </div>
        </div>
        <div className="bento-col-4">
          <div className="surface-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="brand-mark" style={{ background: 'var(--danger)' }}>!</div>
            <div>
              <span className="eyebrow" style={{ color: 'var(--danger)' }}>Urgent</span>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>{stats.actionRequired || 0}</h2>
            </div>
          </div>
        </div>
        <div className="bento-col-4">
          <div className="surface-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="brand-mark" style={{ background: 'var(--success)' }}>✓</div>
            <div>
              <span className="eyebrow" style={{ color: 'var(--success)' }}>Processed</span>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>{Math.max(0, stats.totalEmails - stats.unreadCount)}</h2>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {currentStep < 4 && (
          <div className="surface-card" style={{ border: '1px solid var(--accent)', background: 'rgba(124,58,237,0.05)' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Complete Your Setup</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
               {currentStep === 1 && <button className="button button-primary" onClick={() => navigate('/auth/gmail-connect')}>Connect Gmail</button>}
               {currentStep === 2 && <button className="button button-primary" onClick={handleSyncEmails} disabled={syncing}>Sync Inbox</button>}
               {currentStep === 3 && <button className="button button-primary" onClick={handleTrainStyle} disabled={trainingStyle}>Train AI Voice</button>}
            </div>
          </div>
        )}

        <div className="surface-card" style={{ 
            background: 'var(--panel-elevated)', 
            border: '1px solid var(--border-glow)',
            padding: '2.5rem',
            position: 'relative',
            overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--highlight)' }}>Chief of Staff Briefing</span>
              <h2 style={{ fontSize: '2.2rem', margin: '0.5rem 0' }}>Executive Intelligence</h2>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="button button-secondary" onClick={handleProcessAI} disabled={processingAI}>
                {processingAI ? 'Analyzing...' : '🚀 Refresh Intelligence'}
              </button>
              {inboxSummary?.priority && (
                <span className={`status-pill ${inboxSummary.priority === 'high' ? 'status-warn' : 'status-ok'}`} style={{ fontSize: '1rem' }}>
                  Urgency: {inboxSummary.priority.toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {loadingSummary ? (
            <div style={{ padding: '4rem 0', textAlign: 'center' }}>
              <div className="app-loading-spinner" style={{ margin: '0 auto 1.5rem' }}></div>
              <p style={{ color: 'var(--highlight)', fontWeight: 600 }}>Synthesizing production-level briefing...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              
              <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-lg)', borderLeft: '5px solid var(--highlight)' }}>
                <h3 style={{ fontSize: '1rem', color: 'var(--highlight)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.8rem' }}>📌 Executive Summary</h3>
                <p style={{ fontSize: '1.25rem', lineHeight: '1.7', color: 'var(--text)', fontWeight: 400 }}>
                  {inboxSummary?.executive_summary || 'Synchronizing with your latest communications...'}
                </p>
              </div>

              <div className="bento-grid">
                
                <div className="bento-col-4">
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--indigo)', marginBottom: '1rem', textTransform: 'uppercase' }}>📢 Key Updates</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {(inboxSummary?.key_updates || []).map((update, i) => (
                      <li key={i} style={{ display: 'flex', gap: '0.8rem', fontSize: '0.95rem', color: 'var(--text-dim)' }}>
                        <span style={{ color: 'var(--indigo)' }}>•</span> {update}
                      </li>
                    ))}
                    {(!inboxSummary?.key_updates?.length) && <li style={{ color: 'var(--muted)' }}>No recent updates.</li>}
                  </ul>
                </div>

                <div className="bento-col-4">
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--cyan)', marginBottom: '1rem', textTransform: 'uppercase' }}>🔥 Critical Actions</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {(inboxSummary?.critical_actions || []).map((action, i) => (
                      <li key={i} style={{ display: 'flex', gap: '0.8rem', fontSize: '0.95rem', color: 'var(--text)' }}>
                        <span style={{ color: 'var(--cyan)' }}>→</span> {action}
                      </li>
                    ))}
                    {(!inboxSummary?.critical_actions?.length) && <li style={{ color: 'var(--muted)' }}>Zero urgent actions.</li>}
                  </ul>
                </div>

                <div className="bento-col-4">
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--danger)', marginBottom: '1rem', textTransform: 'uppercase' }}>⚠️ Risks</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '2rem' }}>
                    {(inboxSummary?.risks || []).map((risk, i) => (
                      <li key={i} style={{ display: 'flex', gap: '0.8rem', fontSize: '0.95rem', color: 'var(--danger)' }}>
                        <span>⚠</span> {risk}
                      </li>
                    ))}
                    {(!inboxSummary?.risks?.length) && <li style={{ color: 'var(--muted)' }}>No risks detected.</li>}
                  </ul>

                  <h3 style={{ fontSize: '0.9rem', color: 'var(--success)', marginBottom: '1rem', textTransform: 'uppercase' }}>📊 Insights</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '2rem' }}>
                    {(inboxSummary?.insights || []).map((insight, i) => (
                      <li key={i} style={{ fontSize: '0.9rem', color: 'var(--success)', fontStyle: 'italic' }}>
                        {insight}
                      </li>
                    ))}
                  </ul>

                  <h3 style={{ fontSize: '0.9rem', color: 'var(--highlight)', marginBottom: '1rem', textTransform: 'uppercase' }}>🧠 AI Recommendations</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                    {(inboxSummary?.recommendations || []).map((rec, i) => (
                      <li key={i} style={{ fontSize: '0.95rem', color: 'var(--highlight)', fontWeight: 500 }}>
                        ✨ {rec}
                      </li>
                    ))}
                    {(!inboxSummary?.recommendations?.length) && <li style={{ color: 'var(--muted)' }}>No recommendations yet.</li>}
                  </ul>
                </div>

              </div>
            </div>
          )}
        </div>

        {actionQueue.length > 0 && (
          <div className="surface-card">
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
               <h3 style={{ fontSize: '1.3rem' }}>🚨 Urgent Response Required</h3>
               <button className="button button-ghost" onClick={() => navigate('/inbox?priority=high')}>View All</button>
             </div>
             <div className="bento-grid">
               {actionQueue.slice(0, 3).map(email => (
                 <div key={email.id} className="bento-col-4">
                   <EmailCard email={email} compact onUpdate={fetchEmails} />
                 </div>
               ))}
             </div>
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          <ActionItemsPanel />
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
