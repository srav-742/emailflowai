import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI, emailAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import EmailCard from '../components/EmailCard';
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

  // Step Calculation Logic
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
      return data.stats;
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      return null;
    }
  }, []);

  const fetchMorningBrief = useCallback(async () => {
    try {
      const response = await aiAPI.getMorningBrief();
      const data = response.data || {};
      return data.brief;
    } catch (error) {
      console.error('Failed to fetch morning brief:', error);
      return null;
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await aiAPI.getAnalytics();
      const data = response.data || {};
      return data.stats;
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      return null;
    }
  }, []);

  const fetchInboxSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      const response = await aiAPI.getInboxSummary(20);
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
      if (active) setLoading(false);
    };
    void loadDashboard();
    return () => { active = false; };
  }, [fetchAnalytics, fetchEmails, fetchInboxSummary, fetchMorningBrief, fetchStats, refreshProfile]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshWorkspace();
    }, 20 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!user?.id || !user?.hasGmailAccess) {
      return undefined;
    }

    const socket = connectSocket(user.id);
    if (!socket) return undefined;

    const handleConnect = () => {};
    const handleDisconnect = () => {};

    const handleNewEmails = (incomingEmails = []) => {
      if (!Array.isArray(incomingEmails) || incomingEmails.length === 0) return;
      setEmails((currentEmails) => mergeIncomingEmails(currentEmails, incomingEmails));
      setNotice({ tone: 'ok', text: `${incomingEmails.length} new email(s) analyzed automatically.` });
      void Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics(), refreshProfile()]);
    };

    const handleInboxSummary = (data) => { if (data?.summary) setInboxSummary(data); };

    const handleImportantEmail = (email) => {
      setNotice({ tone: 'warn', text: `Urgent email detected: ${email.subject || 'Untitled'}.` });
      void Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics()]);
    };

    const handleFollowUpReady = (followUps = []) => {
      if (followUps?.length > 0) {
        setNotice({ tone: 'warn', text: `${followUps.length} follow-up reminder(s) ready.` });
      }
      void Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics()]);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new-emails', handleNewEmails);
    socket.on('inbox-summary', handleInboxSummary);
    socket.on('important-email', handleImportantEmail);
    socket.on('follow-up-ready', handleFollowUpReady);

    if (socket.connected) handleConnect();

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
      setNotice({ tone: 'ok', text: response.data.message || 'AI finished processing.' });
      await Promise.all([fetchEmails(), fetchStats(), fetchMorningBrief(), fetchAnalytics(), refreshProfile()]);
    } catch (error) {
      setNotice({ tone: 'warn', text: error.response?.data?.error || 'AI processing failed.' });
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
        text: response.data.warning || response.data.message || 'Emails synced successfully.',
      });
      await Promise.all([fetchStats(), fetchMorningBrief(), fetchAnalytics(), refreshProfile()]);
    } catch (error) {
      setNotice({ tone: 'warn', text: error.response?.data?.error || 'Sync failed.' });
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
      setNotice({ tone: 'warn', text: error.response?.data?.error || 'Training failed.' });
    } finally {
      setTrainingStyle(false);
    }
  };

  const actionQueue = emails.filter((email) => email.actionRequired || email.priority === 'high');
  const pendingTasks = emails
    .flatMap((email) =>
      Array.isArray(email.tasks)
        ? email.tasks.map((task, index) => ({
          ...task,
          emailId: email.id,
          emailSubject: email.subject || 'Untitled email',
          taskKey: `${email.id}-${task.id || index}`,
        }))
        : [],
    )
    .filter((task) => !task.completed);
    
  if (loading) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Loading your progressive dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ marginBottom: '2rem' }}>
        <div>
          <span className="eyebrow">Onboarding Wizard</span>
          <h1 style={{ fontSize: '2.4rem' }}>EmailFlow AI Setup</h1>
        </div>
        {notice && (
          <div className={`status-pill ${notice.tone === 'ok' ? 'status-ok' : 'status-warn'}`}>
            {notice.text}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* STEP 1: Connect Gmail */}
        <div className="surface-card" style={{ 
            opacity: currentStep === 1 ? 1 : 0.6,
            transform: currentStep === 1 ? 'scale(1)' : 'scale(0.98)',
            transition: 'all 0.3s ease',
            border: currentStep === 1 ? '1px solid var(--accent-light)' : '1px solid var(--border)' 
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div className="brand-mark" style={{ background: currentStep > 1 ? 'var(--success)' : '' }}>
              {currentStep > 1 ? '✓' : '1'}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Connect Gmail Account</h2>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>Authorize EmailFlow AI to securely access your inbox for intelligent analysis.</p>
            </div>
            {currentStep === 1 ? (
              <button className="button button-primary" onClick={() => navigate('/auth/gmail-connect')}>
                Connect Gmail Now
              </button>
            ) : (
              <span className="status-pill status-ok">Connected</span>
            )}
          </div>
        </div>

        {/* STEP 2: Sync Inbox */}
        <div className="surface-card" style={{ 
            opacity: currentStep === 2 ? 1 : (currentStep > 2 ? 0.6 : 0.4),
            pointerEvents: currentStep >= 2 ? 'auto' : 'none',
            transform: currentStep === 2 ? 'scale(1)' : 'scale(0.98)',
            transition: 'all 0.3s ease',
            border: currentStep === 2 ? '1px solid var(--cyan)' : '1px solid var(--border)' 
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div className="brand-mark" style={{ background: currentStep > 2 ? 'var(--success)' : (currentStep === 2 ? 'linear-gradient(135deg, var(--cyan), var(--blue))' : 'var(--muted)') }}>
              {currentStep > 2 ? '✓' : '2'}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Sync Your Inbox</h2>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>Pull your recent emails so the AI can build your command center and task lists.</p>
            </div>
            {currentStep === 2 ? (
              <button className="button button-primary" onClick={handleSyncEmails} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync Inbox Now'}
              </button>
            ) : currentStep > 2 ? (
              <button className="button button-ghost" onClick={handleSyncEmails} disabled={syncing}>
                 {syncing ? 'Syncing...' : 'Resync Data'}
              </button>
            ) : null}
          </div>
        </div>

        {/* STEP 3: Train AI Style */}
        <div className="surface-card" style={{ 
            opacity: currentStep === 3 ? 1 : (currentStep > 3 ? 0.6 : 0.4),
            pointerEvents: currentStep >= 3 ? 'auto' : 'none',
            transform: currentStep === 3 ? 'scale(1)' : 'scale(0.98)',
            transition: 'all 0.3s ease',
            border: currentStep === 3 ? '1px solid var(--accent)' : '1px solid var(--border)' 
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div className="brand-mark" style={{ background: currentStep > 3 ? 'var(--success)' : (currentStep === 3 ? 'linear-gradient(135deg, var(--accent), var(--pink))' : 'var(--muted)') }}>
              {currentStep > 3 ? '✓' : '3'}
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Train AI Writing Style</h2>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>Let the AI analyze your sent emails so it can draft replies perfectly in your voice.</p>
            </div>
            {currentStep === 3 ? (
              <button className="button button-primary" onClick={handleTrainStyle} disabled={trainingStyle}>
                {trainingStyle ? 'Training...' : 'Train AI Now'}
              </button>
            ) : currentStep > 3 ? (
               <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                 <span className="status-pill status-ok">Style: {user?.style?.tone || 'Trained'}</span>
                 <button className="button button-ghost" onClick={handleTrainStyle} disabled={trainingStyle}>
                   Retrain
                 </button>
               </div>
            ) : null}
          </div>
        </div>

        {/* STEP 4: AI Command Center (Unlocked state) */}
        <div className="surface-card" style={{ 
            opacity: currentStep === 4 ? 1 : 0.4,
            pointerEvents: currentStep >= 4 ? 'auto' : 'none',
            transform: currentStep === 4 ? 'scale(1)' : 'scale(0.98)',
            transition: 'all 0.3s ease',
            background: currentStep === 4 ? 'linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(6,182,212,0.1) 100%)' : 'var(--panel)',
            border: currentStep === 4 ? '1px solid var(--border-glow)' : '1px solid var(--border)',
            marginTop: '1.5rem'
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
             <div className="brand-mark" style={{ background: currentStep === 4 ? 'linear-gradient(135deg, var(--highlight), var(--cyan))' : 'var(--muted)' }}>
              4
            </div>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: '1.8rem', margin: 0 }}>AI Command Center</h2>
              <p style={{ margin: '0.4rem 0 0', fontSize: '1rem', color: 'var(--text-dim)' }}>Your inbox is fully optimized. Here is your executive summary and urgent tasks.</p>
            </div>
            <button className="button button-secondary" onClick={handleProcessAI} disabled={processingAI || currentStep < 4}>
               {processingAI ? 'Processing...' : 'Run AI Analysis'}
            </button>
          </div>

          {currentStep === 4 && (
             <div className="bento-grid">
               {/* AI Inbox Summary */}
               <div className="bento-col-12">
                 <div className="auth-card-spotlight" style={{ padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
                    <span className="eyebrow">Groq AI Executive Summary</span>
                    <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginTop: '1rem', color: 'var(--text)' }}>
                      {loadingSummary ? 'Synthesizing inbox...' : (inboxSummary?.summary || 'No summary available yet.')}
                    </p>
                 </div>
               </div>

               {/* Urgent Actions */}
               <div className="bento-col-6">
                 <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
                    <span className="eyebrow" style={{ color: 'var(--danger)' }}>🚨 Urgent Queue</span>
                    <h3 style={{ margin: '0.5rem 0 1rem' }}>{actionQueue.length} Action Items</h3>
                    <div className="stack-list">
                      {actionQueue.slice(0, 3).map(email => (
                         <EmailCard key={email.id} email={email} compact onUpdate={fetchEmails} />
                      ))}
                      {actionQueue.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>No urgent emails detected.</p>}
                    </div>
                 </div>
               </div>

               {/* Task Board */}
               <div className="bento-col-6">
                 <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.2)', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
                    <span className="eyebrow" style={{ color: 'var(--cyan)' }}>✅ Extracted Tasks</span>
                    <h3 style={{ margin: '0.5rem 0 1rem' }}>{pendingTasks.length} Pending Tasks</h3>
                    <div className="stack-list">
                      {pendingTasks.slice(0, 3).map(task => (
                        <div key={task.taskKey} style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{task.task}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.3rem' }}>From: {task.emailSubject}</div>
                        </div>
                      ))}
                      {pendingTasks.length === 0 && <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>No tasks pending.</p>}
                    </div>
                 </div>
               </div>

             </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
