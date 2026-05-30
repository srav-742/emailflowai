import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI, emailAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useAccounts } from '../context/AccountContext';
import PricingPage from './PricingPage';
import DocumentIntelligencePage from './DocumentIntelligencePage';
import EmailCard from '../components/EmailCard';
import ActionItemsPanel from '../components/ActionItemsPanel';
import WaitingList from '../components/WaitingList';
import MorningBriefCard from '../components/MorningBriefCard';
import { connectSocket, disconnectSocket } from '../services/socket';
import './Dashboard.css';

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
  const { user, refreshProfile, gmailReconnectState, logout, markGmailReconnectRequired } = useAuth();
  const { accounts, selectedAccountId, setSelectedAccountId, fetchAccounts } = useAccounts();
  const navigate = useNavigate();
  
  const [showSessionsDropdown, setShowSessionsDropdown] = useState(false);

  const savedSessions = useMemo(() => {
    try {
      const all = JSON.parse(localStorage.getItem('savedSessions') || '[]');
      return all.filter(s => s.user?.email && s.user.email !== user?.email);
    } catch {
      return [];
    }
  }, [user?.email]);

  const handleSwitchSession = (session) => {
    localStorage.setItem('token', session.token);
    if (session.refreshToken) {
      localStorage.setItem('refreshToken', session.refreshToken);
    } else {
      localStorage.removeItem('refreshToken');
    }
    window.location.reload();
  };

  const handleAddAccount = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    navigate('/login');
  };

  const handleLogout = async () => {
    try {
      const sessions = JSON.parse(localStorage.getItem('savedSessions') || '[]');
      const filtered = sessions.filter(s => s.user?.email !== user?.email);
      localStorage.setItem('savedSessions', JSON.stringify(filtered));

      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleConnectGmail = async () => {
    try {
      setSyncing(true);
      const response = await authAPI.getGmailAuthUrl();
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        console.error('No Gmail auth URL returned');
      }
    } catch (err) {
      console.error('Failed to get Gmail auth URL:', err);
    } finally {
      setSyncing(false);
    }
  };
  
  // Existing States
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processingAI, setProcessingAI] = useState(false);
  const [notice, setNotice] = useState(null);
  const [inboxSummary, setInboxSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [stats, setStats] = useState({ totalEmails: 0, unreadCount: 0, actionRequired: 0, followUpCount: 0, calendarCount: 0 });

  // Ultra-Premium Cinematic OS States
  const [introActive, setIntroActive] = useState(true);
  const [introStep, setIntroStep] = useState(0);
  const [introProgress, setIntroProgress] = useState(0);
  const [introLogs, setIntroLogs] = useState([]);
  const [activeView, setActiveView] = useState('brief'); // 'brief' | 'inbox' | 'graph' | 'search' | 'agents' | 'analytics'
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [inboxCategory, setInboxCategory] = useState('focus'); // 'focus' | 'all' | 'urgent'
  const [searchQuery, setSearchQuery] = useState('');
  const [graphHoveredNode, setGraphHoveredNode] = useState(null);
  const [graphSelectedNode, setGraphSelectedNode] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [loadingEmailSummary, setLoadingEmailSummary] = useState(false);

  const currentStep = useMemo(() => {
    if (!user?.hasGmailAccess) return 1;
    if (emails.length === 0) return 2;
    return 3;
  }, [user?.hasGmailAccess, emails.length]);

  // Cinematic Intro sequence simulation
  useEffect(() => {
    const logs = [
      '🚀 SYSTEM: Initializing EmailFlow AI Cockpit v1.2...',
      '🔗 SOCKET: Establishing secure WebSocket tunnel...',
      '🧠 CORE: Binding neural semantic index matrix...',
      '📡 PIPELINE: Processing database queue (256/256)...',
      '✨ SUCCESS: Intelligence interface compiled. Ignite workspace.'
    ];
    
    let currentLogIdx = 0;
    const logInterval = setInterval(() => {
      if (currentLogIdx < logs.length) {
        setIntroLogs(prev => [...prev, logs[currentLogIdx]]);
        setIntroStep(currentLogIdx + 1);
        currentLogIdx++;
      } else {
        clearInterval(logInterval);
      }
    }, 450);

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8 + 3;
      if (progress >= 100) {
        progress = 100;
        clearInterval(progressInterval);
        setTimeout(() => {
          setIntroActive(false);
        }, 600);
      }
      setIntroProgress(Math.floor(progress));
    }, 100);

    return () => {
      clearInterval(logInterval);
      clearInterval(progressInterval);
    };
  }, []);

  // API calls
  const fetchEmails = useCallback(async () => {
    try {
      const response = await emailAPI.getEmails({ limit: 50 });
      const data = response.data || {};
      const rawEmails = data.emails || [];
      const merged = new Map();
      rawEmails.forEach(e => merged.set(e.id, e));
      const nextEmails = sortByNewest(Array.from(merged.values()));
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
      if (data.stats) {
        setStats({
          ...data.stats,
          calendarCount: data.calendarCount || 0
        });
      }
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

  // Auto-trigger sync when Gmail is connected but inbox is still empty (first connection)
  const hasAutoSyncedRef = useRef(false);
  useEffect(() => {
    if (user?.hasGmailAccess && !loading && emails.length === 0 && !syncing && !hasAutoSyncedRef.current) {
      hasAutoSyncedRef.current = true;
      console.log('[Dashboard] Auto-triggering initial sync after Gmail connection...');
      handleSyncEmails();
    }
  }, [user?.hasGmailAccess, loading, emails.length, syncing]);

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
    const handleSyncComplete = () => {
      setNotice({ tone: 'ok', text: 'Google sync completed.' });
      void refreshWorkspace();
      void fetchAccounts();
    };
    const handleQueueNewEmail = ({ count = 1 } = {}) => {
      setNotice({ tone: 'ok', text: `${count} new email${count === 1 ? '' : 's'} synced.` });
      void refreshWorkspace();
    };
    const handleSyncError = ({ message } = {}) => {
      setNotice({ tone: 'warn', text: message || 'Google sync hit a recoverable issue.' });
      void fetchAccounts();
    };
    const handleAccountReauth = ({ message } = {}) => {
      markGmailReconnectRequired({
        message: message || 'Google access needs to be reconnected before sync can continue.',
        source: 'socket',
      });
      void fetchAccounts();
    };

    socket.on('new-emails', handleNewEmails);
    socket.on('inbox-summary', handleInboxSummary);
    socket.on('email:new', handleQueueNewEmail);
    socket.on('sync:complete', handleSyncComplete);
    socket.on('sync:error', handleSyncError);
    socket.on('account:reauth', handleAccountReauth);
    socket.on('calendar:updated', handleSyncComplete);

    return () => {
      socket.off('new-emails', handleNewEmails);
      socket.off('inbox-summary', handleInboxSummary);
      socket.off('email:new', handleQueueNewEmail);
      socket.off('sync:complete', handleSyncComplete);
      socket.off('sync:error', handleSyncError);
      socket.off('account:reauth', handleAccountReauth);
      socket.off('calendar:updated', handleSyncComplete);
      disconnectSocket();
    };
  }, [fetchAccounts, fetchInboxSummary, fetchStats, markGmailReconnectRequired, refreshProfile, refreshWorkspace, user?.hasGmailAccess, user?.id]);

  const handleProcessAI = async () => {
    try {
      setProcessingAI(true);
      setNotice({ tone: 'ok', text: 'Running full AI intelligence scan...' });
      await emailAPI.aiProcessAll();
      try {
        await digestAPI.generateDigest();
      } catch (digErr) {
        console.warn('Manual digest generation failed, using cached brief:', digErr.message);
      }
      await refreshWorkspace();
      setNotice({ tone: 'ok', text: 'Intelligence scan complete.' });
    } catch {
      setNotice({ tone: 'warn', text: 'AI scan failed.' });
    } finally {
      setProcessingAI(false);
    }
  };

  const handleSyncEmails = async (e) => {
    try {
      setSyncing(true);
      await emailAPI.syncEmails(selectedAccountId);
      await refreshWorkspace();
      setNotice({ tone: 'ok', text: 'Inbox synced successfully.' });
      if (e?.target) {
        const btn = e.target;
        const originalText = btn.innerText;
        btn.innerText = '✅ Synced successfully';
        btn.style.background = '#10b981';
        setTimeout(() => {
          if (btn) {
            btn.innerText = originalText;
            btn.style.background = '';
          }
        }, 4000);
      }
    } catch {
      setNotice({ tone: 'warn', text: gmailReconnectState?.required ? 'Gmail needs to be reconnected before sync can continue.' : 'Sync failed.' });
    } finally {
      setSyncing(false);
    }
  };

  // Memory Graph Canvas Node Definitions
  const graphNodes = useMemo(() => [
    { id: 0, label: 'EmailFlow AI', x: 0.5, y: 0.5, r: 24, color: '#3D9FFF', type: 'Core Processor', desc: 'Central orchestration email index platform.' },
    { id: 1, label: 'Sarah Mitchell', x: 0.2, y: 0.25, r: 18, color: '#8B6FFF', type: 'Investor', desc: 'VALUATION & ROADMAP - Discussed valuations on Thursday. Waiting response.' },
    { id: 2, label: 'Alex Chen', x: 0.25, y: 0.75, r: 18, color: '#8B6FFF', type: 'Lead Dev', desc: 'DOCKER PIPELINE - Resolving CI builds, deployment tasks assigned.' },
    { id: 3, label: 'Stripe', x: 0.8, y: 0.2, r: 18, color: '#00E5FF', type: 'Partner', desc: 'FINANCIAL SYNC - Managed invoices and automatic billing accounts.' },
    { id: 4, label: 'Roadmap Q3', x: 0.75, y: 0.75, r: 18, color: '#a855f7', type: 'Milestone', desc: 'TIMELINES - Critical milestones for alpha dashboard deployments.' },
    { id: 5, label: 'Term Sheet', x: 0.1, y: 0.5, r: 16, color: '#ef4444', type: 'Document', desc: 'URGENT SIGNATURES - Draft shared via DocuSign yesterday morning.' },
    { id: 6, label: 'Weekly Sync', x: 0.9, y: 0.5, r: 16, color: '#10b981', type: 'Event', desc: 'CALENDAR - Strategic alignment meeting every Friday morning.' },
    { id: 7, label: 'Google API', x: 0.5, y: 0.15, r: 16, color: '#00E5FF', type: 'Integration', desc: 'GMAIL ACCESS TUNNEL - Oauth credentials and push sync subscriptions.' },
    { id: 8, label: 'AI Autopilot', x: 0.5, y: 0.85, r: 20, color: '#a855f7', type: 'Agent', desc: 'CLASSIFICATION PIPELINE - Continuous background context indexing.' },
    { id: 9, label: 'Valuation PDF', x: 0.08, y: 0.15, r: 15, color: '#ef4444', type: 'Attachment', desc: 'FINANCIAL ARCHIVE - Pitch deck and Q3 cap table updates.' }
  ], []);

  const graphLinks = useMemo(() => [
    { source: 0, target: 1 },
    { source: 0, target: 2 },
    { source: 0, target: 3 },
    { source: 0, target: 4 },
    { source: 0, target: 6 },
    { source: 1, target: 5 },
    { source: 3, target: 4 },
    { source: 4, target: 2 },
    { source: 0, target: 7 },
    { source: 0, target: 8 },
    { source: 1, target: 9 },
    { source: 8, target: 4 }
  ], []);

  // Graph Canvas Renderer Loop
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const pulseOffsetRef = useRef(0);

  useEffect(() => {
    if (activeView !== 'graph' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const handleResize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pulseOffsetRef.current = (pulseOffsetRef.current + 0.05) % 1;

      const w = canvas.width;
      const h = canvas.height;

      // Draw grid mesh backplate
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Render Connection links
      graphLinks.forEach(link => {
        const s = graphNodes[link.source];
        const t = graphNodes[link.target];
        if (!s || !t) return;

        const sx = s.x * w;
        const sy = s.y * h;
        const tx = t.x * w;
        const ty = t.y * h;

        // Base line
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw traveling neural pulse lights
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pulseRatio = pulseOffsetRef.current;
        const px = sx + dx * pulseRatio;
        const py = sy + dy * pulseRatio;

        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0; // Reset
      });

      // Render Nodes
      graphNodes.forEach(node => {
        const nx = node.x * w;
        const ny = node.y * h;

        ctx.beginPath();
        ctx.arc(nx, ny, node.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10, 15, 30, 0.9)';
        ctx.fill();

        // Glowing outer border
        ctx.beginPath();
        ctx.arc(nx, ny, node.r, 0, Math.PI * 2);
        ctx.strokeStyle = node.color;
        ctx.lineWidth = graphHoveredNode?.id === node.id || graphSelectedNode?.id === node.id ? 3 : 1.5;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = graphHoveredNode?.id === node.id ? 15 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset

        // Dynamic center pulse
        ctx.beginPath();
        ctx.arc(nx, ny, 4, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Labels
        ctx.font = '10px "SF Pro Display", system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, nx, ny + node.r + 14);
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [activeView, graphNodes, graphLinks, graphHoveredNode, graphSelectedNode]);

  // Handle Graph Interaction coordinates
  const handleMouseMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;

    let found = null;
    graphNodes.forEach(node => {
      const nx = node.x * w;
      const ny = node.y * h;
      const dx = mouseX - nx;
      const dy = mouseY - ny;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.r + 10) {
        found = node;
      }
    });

    if (found) {
      setGraphHoveredNode(found);
      const nx = found.x * w;
      const ny = found.y * h;
      setTooltipPos({ x: nx, y: ny });
    } else {
      setGraphHoveredNode(null);
    }
  };

  const handleCanvasClick = () => {
    if (graphHoveredNode) {
      setGraphSelectedNode(graphHoveredNode);
    } else {
      setGraphSelectedNode(null);
    }
  };

  const handleSelectEmail = async (email) => {
    setSelectedEmail(email);
    if (!email.summary && !email.aiSummary) {
      try {
        setLoadingEmailSummary(true);
        let summaryText = '';
        try {
          const res = await emailAPI.aiSummarize(email.id);
          summaryText = res.data?.summary;
        } catch (aiErr) {
          console.warn('AI summary failed or plan gated, falling back to local engine:', aiErr);
          const res = await emailAPI.summarizeEmail(email.id);
          summaryText = res.data?.email?.summary || res.data?.summary;
        }

        if (summaryText) {
          setEmails(current =>
            current.map(e => e.id === email.id ? { ...e, summary: summaryText } : e)
          );
          setSelectedEmail(curr =>
            curr?.id === email.id ? { ...curr, summary: summaryText } : curr
          );
        }
      } catch (err) {
        console.error('Failed to generate summary:', err);
      } finally {
        setLoadingEmailSummary(false);
      }
    }
  };

  const getDisplaySummary = (summary) => {
    if (!summary) return 'AI Summary has not been generated for this email sequence yet.';
    if (typeof summary === 'string' && summary.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(summary);
        return parsed.formatted_summary || parsed.summary || summary;
      } catch (e) {
        return summary;
      }
    }
    return summary;
  };

  // Filtered emails for the dashboard
  const categorizedEmails = useMemo(() => {
    let result = emails;
    
    // Filter by multi-account selection if selectedAccountId is specified
    if (selectedAccountId) {
      result = result.filter(e => e.accountId === selectedAccountId);
    }

    if (inboxCategory === 'focus') {
      result = result.filter(e => e.priority === 'high' || e.actionRequired);
    } else if (inboxCategory === 'urgent') {
      result = result.filter(e => e.priority === 'high');
    }
    return result;
  }, [emails, inboxCategory, selectedAccountId]);

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    return emails.filter(e => 
      e.subject?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.sender?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.body?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [emails, searchQuery]);

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
      {/* ── CINEMATIC INTRO FADE-IN SCREEN ── */}
      {introActive && (
        <div className={`cinematic-intro-overlay ${introProgress === 100 ? 'fade-out' : ''}`}>
          <div className="intro-logo-glow">
            <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>Σ</span>
          </div>
          <div className="intro-terminal">
            <div style={{ color: 'var(--text-mute)', marginBottom: '8px' }}>// SYSTEM BOOT PROTOCOL</div>
            {introLogs.map((log, index) => (
              <div key={index} className="intro-terminal-line typing">
                {log}
              </div>
            ))}
            <div className="intro-progress-bar">
              <div className="intro-progress-fill" style={{ width: `${introProgress}%` }}></div>
            </div>
            <div style={{ textAlign: 'right', marginTop: '6px', fontSize: '9px', color: 'var(--text-mute)' }}>
              SYNCHRONIZING VECTORS: {introProgress}%
            </div>
          </div>
        </div>
      )}

      {/* ── AMBIENT NEON GLOW FIELDS ── */}
      <div className="cockpit-glow-field glow-blue"></div>
      <div className="cockpit-glow-field glow-purple"></div>

      {/* ── MAIN COCKPIT DASHBOARD STRUCTURE ── */}
      <div className="cockpit-container">
        
        {/* ── ASTRO-METRIC FLOATING NAV RAIL ── */}
        <aside className="cockpit-sidebar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2.5rem', paddingLeft: '10px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', background: 'linear-gradient(135deg, var(--neon-blue), var(--neon-violet))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EmailFlowAI</span>
            <span className="importance-tag tag-high" style={{ fontSize: '7px', padding: '1px 5px' }}>OS PRO</span>
          </div>

          <span className="sidebar-section-title">Telemetry Decks</span>
          <div className={`cockpit-nav-item ${activeView === 'brief' ? 'active' : ''}`} onClick={() => setActiveView('brief')}>
            <span className="nav-icon">✦</span> Daily Briefing
          </div>
          <div className={`cockpit-nav-item ${activeView === 'inbox' ? 'active' : ''}`} onClick={() => setActiveView('inbox')}>
            <span className="nav-icon">📬</span> Smart Inbox Command
          </div>
          <div className={`cockpit-nav-item ${activeView === 'graph' ? 'active' : ''}`} onClick={() => setActiveView('graph')}>
            <span className="nav-icon">🧠</span> Neural Memory Graph
          </div>
          <div className={`cockpit-nav-item ${activeView === 'search' ? 'active' : ''}`} onClick={() => setActiveView('search')}>
            <span className="nav-icon">🔍</span> Semantic Search
          </div>
          <div className={`cockpit-nav-item ${activeView === 'analytics' ? 'active' : ''}`} onClick={() => { setActiveView('analytics'); setSelectedEmail(null); }}>
            <span className="nav-icon">📈</span> System Analytics
          </div>
          <div className={`cockpit-nav-item ${activeView === 'pricing' ? 'active' : ''}`} onClick={() => { setActiveView('pricing'); setSelectedEmail(null); }}>
            <span className="nav-icon">💎</span> Upgrade & Pricing
          </div>
          <div className={`cockpit-nav-item ${activeView === 'documents' ? 'active' : ''}`} onClick={() => { setActiveView('documents'); setSelectedEmail(null); }}>
            <span className="nav-icon">📄</span> Document Intel Hub
          </div>

          <span className="sidebar-section-title" style={{ marginTop: '1.25rem', display: 'block' }}>Connected Channels</span>
          <div className="connected-channels-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto', paddingRight: '4px' }}>
            <div 
              className={`cockpit-nav-item ${selectedAccountId === null ? 'active' : ''}`} 
              onClick={() => setSelectedAccountId(null)}
              style={{ padding: '6px 10px', fontSize: '11px', minHeight: 'auto', height: 'auto', display: 'flex', alignItems: 'center' }}
            >
              <span className="account-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neon-blue)', boxShadow: '0 0 8px var(--neon-blue)', marginRight: '8px', display: 'inline-block', flexShrink: 0 }}></span>
              <span>All Accounts</span>
            </div>

            {accounts && accounts.map(acc => (
              <div 
                key={acc.id} 
                className={`cockpit-nav-item ${selectedAccountId === acc.id ? 'active' : ''}`} 
                onClick={() => setSelectedAccountId(acc.id)}
                style={{ padding: '6px 10px', fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 'auto', height: 'auto' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <span className="account-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', background: acc.color || '#6366f1', boxShadow: `0 0 8px ${acc.color || '#6366f1'}`, display: 'inline-block', flexShrink: 0 }}></span>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {acc.displayName || acc.email.split('@')[0]}
                  </span>
                </div>
                {acc.reconnectRequired && (
                  <span style={{ fontSize: '9px', color: 'var(--neon-red)' }}>⚠️</span>
                )}
              </div>
            ))}
          </div>
          
          <button 
            className="button button-secondary" 
            onClick={handleConnectGmail}
            style={{ padding: '5px 10px', fontSize: '10px', marginTop: '4px', width: '100%', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)' }}
          >
            ➕ Link Account
          </button>

          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-glass)', paddingTop: '1.25rem', position: 'relative' }}>
            
            {/* Multi-Login Dropup Selector Menu */}
            {showSessionsDropdown && (
              <div 
                style={{ 
                  position: 'absolute', 
                  bottom: '100%', 
                  left: 0, 
                  right: 0, 
                  background: 'rgba(15, 20, 30, 0.95)', 
                  border: '1px solid rgba(139, 111, 255, 0.35)', 
                  borderRadius: '12px', 
                  padding: '8px', 
                  marginBottom: '10px', 
                  boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.5), 0 0 15px rgba(139, 111, 255, 0.1)',
                  zIndex: 9999,
                  backdropFilter: 'blur(20px)',
                  animation: 'fadeInCockpit 0.2s ease-out'
                }}
              >
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--neon-violet)', textTransform: 'uppercase', padding: '4px 8px 6px', borderBottom: '1px solid rgba(255,255,255,0.05)', letterSpacing: '0.05em' }}>
                  👥 Identity Selector (Multi-Login)
                </div>
                
                <div style={{ maxHeight: '150px', overflowY: 'auto', margin: '4px 0' }}>
                  {savedSessions.length === 0 ? (
                    <div style={{ padding: '8px', fontSize: '10px', color: 'var(--text-mute)', textAlign: 'center' }}>
                      No other active sessions.
                    </div>
                  ) : (
                    savedSessions.map((session, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => handleSwitchSession(session)}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px', 
                          padding: '6px 8px', 
                          borderRadius: '8px', 
                          cursor: 'pointer', 
                          background: 'transparent',
                          transition: 'background 0.2s'
                        }}
                        className="session-switch-item"
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <div className="reader-avatar" style={{ width: 22, height: 22, fontSize: '9px', background: 'var(--neon-violet)', color: '#fff' }}>
                          {session.user?.name ? session.user.name[0].toUpperCase() : 'U'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>{session.user?.name}</div>
                          <div style={{ fontSize: '8px', color: 'var(--text-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.user?.email}</div>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--neon-violet)' }}>🔌</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button 
                    onClick={handleAddAccount}
                    style={{ 
                      width: '100%', 
                      padding: '6px 8px', 
                      borderRadius: '8px', 
                      fontSize: '10px', 
                      background: 'rgba(61, 159, 255, 0.08)', 
                      border: '1px solid rgba(61, 159, 255, 0.25)', 
                      color: 'var(--neon-cyan)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>➕</span> Add Another Account
                  </button>
                </div>
              </div>
            )}

            {/* Glowing Active User Card */}
            <div 
              onClick={() => setShowSessionsDropdown(!showSessionsDropdown)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                fontSize: '12px', 
                background: 'rgba(255, 255, 255, 0.02)', 
                border: '1px solid var(--border-glass)', 
                borderRadius: '12px', 
                padding: '10px', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative'
              }}
              className="premium-profile-tile"
              onMouseEnter={(e) => {
                e.currentTarget.style.border = '1px solid rgba(139, 111, 255, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(139, 111, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.border = '1px solid var(--border-glass)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div 
                className="reader-avatar" 
                style={{ 
                  width: 32, 
                  height: 32, 
                  fontSize: '11px', 
                  background: 'linear-gradient(135deg, var(--neon-blue) 0%, var(--neon-violet) 100%)',
                  boxShadow: '0 0 8px rgba(139, 111, 255, 0.3)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                {user?.name ? user.name[0].toUpperCase() : 'U'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user?.name || 'Executive User'}</span>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--neon-green)', boxShadow: '0 0 6px var(--neon-green)', display: 'inline-block' }}></span>
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email || 'admin@emailflow.ai'}</div>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-mute)' }}>{showSessionsDropdown ? '▼' : '▲'}</span>
            </div>

            <button 
              className="button button-logout" 
              style={{ 
                padding: '8px', 
                fontSize: '11px', 
                width: '100%', 
                border: '1px solid rgba(239, 68, 68, 0.35)', 
                borderRadius: '10px', 
                background: 'rgba(239, 68, 68, 0.08)', 
                color: 'var(--neon-red)', 
                marginTop: '10px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }} 
              onClick={handleLogout}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                e.currentTarget.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span>📴</span> Logout Session
            </button>

          </div>
        </aside>

        {/* ── COCKPIT WORKSPACE SCREEN ── */}
        <main style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingRight: '1rem' }}>
          
          {/* ── REAL-TIME SYSTEM STATUS TELEMETRY BAR ── */}
          <div className="cockpit-header-bar">
            <div>
              <span className="sidebar-section-title" style={{ padding: 0 }}>Active Node</span>
              <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>
                {activeView === 'brief' && 'Chief of Staff Dashboard'}
                {activeView === 'inbox' && 'Smart Inbox Command Center'}
                {activeView === 'graph' && 'Neural Memory Relationship Visualizer'}
                {activeView === 'search' && 'Semantic Vector Search Console'}
                {activeView === 'agents' && 'Autonomous AI Agent Pipelines'}
                {activeView === 'analytics' && 'Operational Productivity Telemetry'}
                {activeView === 'documents' && 'Document Intelligence Hub'}
              </h2>
            </div>
            
            <div className="system-telemetry">
              {notice && (
                <span className="importance-tag tag-high" style={{ padding: '4px 10px', background: 'rgba(239, 68, 68, 0.08)' }}>
                  {notice.text}
                </span>
              )}
              <div className="telemetry-node">
                <div className={`telemetry-pulse ${syncing ? 'syncing' : ''}`}></div>
                Gmail: {user?.hasGmailAccess ? 'Connected' : 'Disconnected'}
              </div>
              <div className="telemetry-node">
                <div className={`telemetry-pulse ${processingAI ? 'processing' : ''}`}></div>
                AI Agent Pipeline: {processingAI ? 'Scanning' : 'Standby'}
              </div>
              <button className="button button-primary" style={{ padding: '8px 16px', fontSize: '11px', display: 'flex', gap: '8px', alignItems: 'center' }} onClick={handleSyncEmails} disabled={syncing}>
                {syncing ? 'Syncing...' : '⚡ Manual Sync'}
              </button>
            </div>
          </div>

          {/* ── RENDER DYNAMIC DASHBOARD DECKS ── */}
          <div style={{ flex: 1 }}>

            {/* 1. DAILY BRIEFING VIEW */}
            {activeView === 'brief' && (
              <div className="briefing-deck">
                {currentStep < 3 && (
                  <div className="surface-card setup-action-banner">
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '0.8rem' }}>Complete Core Integration</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-dimmed)', marginBottom: '1.2rem' }}>To experience full autonomous agent scheduling and inbox summaries, activate your secure Google API links.</p>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      {currentStep === 1 && <button className="button button-primary" onClick={handleConnectGmail} disabled={syncing}>{syncing ? 'Redirecting...' : (gmailReconnectState?.required ? 'Reconnect Gmail' : 'Connect Gmail')}</button>}
                      {currentStep === 2 && <button className="button button-primary" onClick={handleSyncEmails} disabled={syncing}>Sync Inbox</button>}
                    </div>
                  </div>
                )}

                <div className="briefing-grid-cockpit">
                  <div className="premium-brief-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                      <div>
                        <span className="sidebar-section-title" style={{ padding: 0, color: 'var(--neon-blue)' }}>AI Synthesized Intel</span>
                        <h2 style={{ fontSize: '1.8rem', margin: '0.25rem 0 0.75rem' }}>Morning Chief of Staff Brief</h2>
                      </div>
                      <button className="button button-secondary" style={{ fontSize: '11px', padding: '8px 16px' }} onClick={handleProcessAI} disabled={processingAI}>
                        {processingAI ? 'Analyzing...' : '🚀 Re-compile Summary'}
                      </button>
                    </div>

                    <div className="executive-summary-panel">
                      <h3 style={{ fontSize: '0.9rem', color: 'var(--neon-cyan)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>📌 Executive Action Summary</h3>
                      <p style={{ fontSize: '1.15rem', lineHeight: '1.7', color: '#ffffff', margin: 0 }}>
                        {inboxSummary?.executive_summary || 'Your automated Chief of Staff is compiling your latest inbox summaries...'}
                      </p>
                    </div>

                    <div className="cockpit-bento-subgrid">
                      <div className="briefing-column">
                        <span className="briefing-column-title" style={{ color: 'var(--neon-blue)' }}>📢 KEY UPDATES</span>
                        <ul>
                          {(inboxSummary?.key_updates || []).map((update, i) => (
                            <li key={i} style={{ '--bullet-color': 'var(--neon-blue)' }}>{update}</li>
                          ))}
                          {!inboxSummary?.key_updates?.length && <li style={{ color: 'var(--text-mute)' }}>Zero recent system updates detected.</li>}
                        </ul>
                      </div>

                      <div className="briefing-column" style={{ border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                        <span className="briefing-column-title" style={{ color: 'var(--neon-red)' }}>🚨 CRITICAL ACTIONS</span>
                        <ul>
                          {(inboxSummary?.critical_actions || []).map((action, i) => (
                            <li key={i} style={{ '--bullet-color': 'var(--neon-red)' }}>{action}</li>
                          ))}
                          {!inboxSummary?.critical_actions?.length && <li style={{ color: 'var(--text-mute)' }}>Zero urgent items awaiting reply.</li>}
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="surface-card" style={{ padding: '1.5rem', background: 'rgba(10,12,16,0.4)', border: '1px solid var(--border-glass)' }}>
                      <span className="sidebar-section-title" style={{ padding: 0, color: 'var(--neon-purple)' }}>SYSTEM TELEMETRY</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-mute)' }}>Total Processed:</span>
                          <span style={{ fontWeight: 600 }}>{stats.totalEmails || 0}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-mute)' }}>Urgent Action Items:</span>
                          <span style={{ color: 'var(--neon-red)', fontWeight: 600 }}>{stats.actionRequired || 0}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-mute)' }}>AI Confidence Index:</span>
                          <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>98.4%</span>
                        </div>
                      </div>
                    </div>

                    <div className="surface-card" style={{ padding: '1.5rem', background: 'rgba(10,12,16,0.4)', border: '1px solid var(--border-glass)' }}>
                      <span className="sidebar-section-title" style={{ padding: 0, color: 'var(--neon-cyan)' }}>⚠️ SYSTEM RISKS</span>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                        {(inboxSummary?.risks || []).map((risk, i) => (
                          <li key={i} style={{ color: 'var(--neon-red)', display: 'flex', gap: '6px' }}><span>⚠</span> {risk}</li>
                        ))}
                        {!inboxSummary?.risks?.length && <li style={{ color: 'var(--text-mute)' }}>No operational risks analyzed.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. SMART INBOX COMMAND CENTER VIEW */}
            {activeView === 'inbox' && (
              <div className="inbox-command-deck">
                
                {/* Inbox Scroller Column */}
                <div className="inbox-scroller-panel">
                  <div className="inbox-smart-tabs">
                    <div className={`inbox-tab-btn ${inboxCategory === 'focus' ? 'active' : ''}`} onClick={() => setInboxCategory('focus')}>Focus Today</div>
                    <div className={`inbox-tab-btn ${inboxCategory === 'all' ? 'active' : ''}`} onClick={() => setInboxCategory('all')}>Unified Inbox</div>
                    <div className={`inbox-tab-btn ${inboxCategory === 'urgent' ? 'active' : ''}`} onClick={() => setInboxCategory('urgent')}>High Urgency</div>
                  </div>

                  {categorizedEmails.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-mute)' }}>
                      <span style={{ fontSize: '2rem' }}>📬</span>
                      <p style={{ fontSize: '12px', marginTop: '8px' }}>Inbox fully optimized and processed.</p>
                    </div>
                  ) : (
                    categorizedEmails.map((email) => (
                      <div key={email.id} className={`cockpit-email-card ${selectedEmail?.id === email.id ? 'selected' : ''}`} onClick={() => handleSelectEmail(email)}>
                        <div className="card-header-row">
                          <span className="card-sender">{email.sender || 'Unknown Sender'}</span>
                          <span className="card-time">{new Date(email.receivedAt || email.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="card-subject">{email.subject || 'No Subject'}</div>
                        <div className="card-preview">{email.body || 'No description available'}</div>
                        <div className="card-footer-row">
                          <span className={`importance-tag ${email.priority === 'high' ? 'tag-high' : email.priority === 'medium' ? 'tag-medium' : 'tag-low'}`}>
                            {email.priority?.toUpperCase() || 'NORMAL'}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--neon-cyan)', fontWeight: 600 }}>
                            ✦ {email.actionRequired ? 'Action Req' : 'Info Node'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Unified Reader Column */}
                <div className="inbox-reader-panel">
                  {selectedEmail ? (
                    <div>
                      <div className="reader-header">
                        <div className="reader-title">{selectedEmail.subject || '(No Subject)'}</div>
                        <div className="reader-meta-row">
                          <div className="reader-sender-info">
                            <div className="reader-avatar">{selectedEmail.sender ? selectedEmail.sender[0].toUpperCase() : 'U'}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{selectedEmail.sender}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-mute)' }}>Received: {new Date(selectedEmail.receivedAt || selectedEmail.createdAt).toLocaleString()}</div>
                            </div>
                          </div>
                          <span className={`importance-tag ${selectedEmail.priority === 'high' ? 'tag-high' : 'tag-medium'}`}>
                            ✦ AI PRIORITY: {selectedEmail.priority?.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="reader-body">{selectedEmail.body || 'This email content is empty.'}</div>

                      <div className="reader-ai-sidebar">
                        <div className="ai-sidebar-title">
                          <span>🧠</span> COGNITIVE CO-PILOT ANALYSIS
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div>
                            <span style={{ fontSize: '10px', color: 'var(--text-mute)', display: 'block', marginBottom: '3px' }}>AI EXECUTIVE SUMMARY:</span>
                            {loadingEmailSummary ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                                <div className="app-loading-spinner" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--neon-blue)' }}></div>
                                <span style={{ fontSize: '11px', color: 'var(--text-mute)' }}>Analyzing context parameters...</span>
                              </div>
                            ) : (
                              <p className="ai-summary-text" style={{ whiteSpace: 'pre-line' }}>
                                {getDisplaySummary(selectedEmail.summary || selectedEmail.aiSummary)}
                              </p>
                            )}
                          </div>
                          {selectedEmail.actionRequired && (
                            <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(239,68,68,0.06)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                              <span style={{ fontSize: '10px', color: 'var(--neon-red)', fontWeight: 700, display: 'block', marginBottom: '3px' }}>⚡ EXTRACTED ACTION ITEM:</span>
                              <p style={{ fontSize: '11px', margin: 0, color: 'var(--text-dimmed)' }}>Reply, review, or connect to workflows by next business day.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="reader-empty-state">
                      <span className="reader-empty-icon">📬</span>
                      <h3 style={{ fontSize: '1.25rem', color: '#ffffff', margin: '0 0 4px' }}>AI Operating System Reader</h3>
                      <p style={{ fontSize: '12px', maxWidth: '320px', margin: 0 }}>Select any incoming communication stream from the command center list to analyze vector parameters.</p>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* 3. NEURAL MEMORY GRAPH VIEW */}
            {activeView === 'graph' && (
              <div className="graph-viewport-panel" onMouseMove={handleMouseMove} onClick={handleCanvasClick}>
                <canvas ref={canvasRef} className="graph-canvas-layer"></canvas>
                
                <div className="graph-glass-controls">
                  <span>🟢 Left-click to traverse relationship parameters</span>
                  <span>✨ Neural Indexing: Sync complete</span>
                </div>

                {/* Glowing tooltips */}
                <div className={`graph-node-tooltip ${graphHoveredNode ? 'visible' : ''}`} style={{ left: tooltipPos.x, top: tooltipPos.y }}>
                  {graphHoveredNode && (
                    <>
                      <div className="tooltip-title">{graphHoveredNode.label}</div>
                      <div className="tooltip-type">{graphHoveredNode.type}</div>
                      <div className="tooltip-body">{graphHoveredNode.desc}</div>
                    </>
                  )}
                </div>

                {/* Selected Node Panel */}
                {graphSelectedNode && (
                  <div style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(10,12,16,0.85)', border: '1px solid rgba(61,159,255,0.4)', borderRadius: '16px', padding: '1.25rem', width: '280px', zIndex: 10, backdropFilter: 'blur(16px)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <span className="importance-tag tag-high" style={{ background: 'rgba(61,159,255,0.12)', color: 'var(--neon-blue)' }}>{graphSelectedNode.type}</span>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '14px' }} onClick={() => setGraphSelectedNode(null)}>×</button>
                    </div>
                    <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px', color: '#fff' }}>{graphSelectedNode.label}</h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-dimmed)', lineHeight: '1.5', margin: '0 0 12px' }}>{graphSelectedNode.desc}</p>
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-mute)', display: 'block', marginBottom: '4px' }}>CONNECTED PARAMETERS:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {graphLinks.filter(l => l.source === graphSelectedNode.id || l.target === graphSelectedNode.id).map(l => {
                          const otherNode = l.source === graphSelectedNode.id ? graphNodes[l.target] : graphNodes[l.source];
                          return (
                            <span key={otherNode.id} className="importance-tag tag-low" style={{ fontSize: '8px' }}>
                              {otherNode.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. SEMANTIC SEARCH VIEW */}
            {activeView === 'search' && (
              <div className="search-view-panel">
                <div className="search-glowing-input-wrap">
                  <span className="search-glass-icon">🔍</span>
                  <input type="text" className="search-glowing-input" placeholder="Query your cognitive email history using natural language..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>

                <div className="search-prompts-suggestions">
                  {['What commitments did I make to Sarah?', 'Show Stripe billing confirmations', 'Find Docker container pipeline threads'].map((prompt) => (
                    <div key={prompt} className="search-suggestion-chip" onClick={() => setSearchQuery(prompt)}>
                      {prompt}
                    </div>
                  ))}
                </div>

                <div className="search-results-grid">
                  {searchQuery ? (
                    searchResults.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-mute)', padding: '2rem' }}>
                        <p>No semantic vector weights matched your query.</p>
                      </div>
                    ) : (
                      searchResults.map((email) => (
                        <div key={email.id} className="cockpit-email-card" onClick={() => { setActiveView('inbox'); setSelectedEmail(email); }}>
                          <div className="card-header-row">
                            <span className="card-sender">{email.sender}</span>
                            <span className="search-relevance-badge">✦ 98.4% Match</span>
                          </div>
                          <div className="card-subject">{email.subject}</div>
                          <div className="card-preview">{email.body}</div>
                        </div>
                      ))
                    )
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-mute)', padding: '3rem 1rem' }}>
                      <span style={{ fontSize: '3rem' }}>🧠</span>
                      <p style={{ fontSize: '13px', marginTop: '10px' }}>Your entire communications grid is indexed vectorially. Ask anything naturally.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. AI AGENT ORCHESTRATION VIEW */}
            {activeView === 'agents' && (
              <div className="orchestration-deck">
                <div className="agent-node-card">
                  <div style={{ display: 'flex', justifySelf: 'flex-start', alignItems: 'center', gap: '8px' }}>
                    <div className="telemetry-pulse"></div>
                    <h3 style={{ fontSize: '15px', margin: 0, fontWeight: 700 }}>Inbox Autonomous Classifier</h3>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-dimmed)', margin: 0 }}>Classifies incoming communications based on urgency indices, pricing requests, and calendar bindings.</p>
                  
                  <div className="workflow-pipeline-box">
                    <div className="workflow-connector-line"></div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 2, background: 'rgba(10,12,16,0.95)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-glass)', marginBottom: '14px' }}>
                      <div className="reader-avatar" style={{ background: 'rgba(61, 159, 255, 0.1)', color: 'var(--neon-blue)', width: 24, height: 24, fontSize: '10px' }}>📥</div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600 }}>Stream Endpoint Listener</div>
                        <span style={{ fontSize: '8px', color: 'var(--neon-green)' }}>ACTIVE LISTENING</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 2, background: 'rgba(10,12,16,0.95)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-glass)', marginBottom: '14px' }}>
                      <div className="reader-avatar" style={{ background: 'rgba(0, 229, 255, 0.1)', color: 'var(--neon-cyan)', width: 24, height: 24, fontSize: '10px' }}>⚙️</div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600 }}>Vector Parameter Classifier</div>
                        <span style={{ fontSize: '8px', color: 'var(--neon-cyan)' }}>INDEXING BLOCKS</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', zIndex: 2, background: 'rgba(10,12,16,0.95)', padding: '10px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                      <div className="reader-avatar" style={{ background: 'rgba(139, 111, 255, 0.1)', color: 'var(--neon-violet)', width: 24, height: 24, fontSize: '10px' }}>📤</div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600 }}>Autonomous Draft Generator</div>
                        <span style={{ fontSize: '8px', color: 'var(--text-mute)' }}>STANDBY</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="agent-node-card">
                  <h3 style={{ fontSize: '15px', margin: 0, fontWeight: 700 }}>Active Auto-Pilot Classifiers</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '1rem' }}>
                    <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Executive Brief Synthesizer</div>
                        <span style={{ fontSize: '9px', color: 'var(--text-mute)' }}>Executes every morning at 08:00 AM</span>
                      </div>
                      <span className="importance-tag tag-high" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--neon-green)', borderColor: 'rgba(16,185,129,0.3)' }}>ONLINE</span>
                    </div>

                    <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Financial Invoice Router</div>
                        <span style={{ fontSize: '9px', color: 'var(--text-mute)' }}>Categorizes invoices and payment timelines</span>
                      </div>
                      <span className="importance-tag tag-high" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--neon-green)', borderColor: 'rgba(16,185,129,0.3)' }}>ONLINE</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 6. SYSTEM ANALYTICS VIEW */}
            {activeView === 'analytics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="analytics-deck-panel">
                  <div className="surface-card" style={{ padding: '1.5rem', background: 'rgba(10,12,16,0.4)', border: '1px solid var(--border-glass)' }}>
                    <span className="sidebar-section-title" style={{ padding: 0 }}>EMAIL RESPONSE VOLUME</span>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 0' }}>{stats.totalEmails || 0}</h3>
                    <div className="sparkline-container" style={{ background: 'rgba(61,159,255,0.02)', border: '1px solid rgba(61,159,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                      <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
                        <defs>
                          <linearGradient id="glow-blue-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3D9FFF" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#3D9FFF" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0,25 Q15,10 30,18 T60,5 T90,12 L100,8 L100,30 L0,30 Z" fill="url(#glow-blue-grad)" />
                        <path d="M0,25 Q15,10 30,18 T60,5 T90,12 L100,8" fill="none" stroke="#3D9FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  <div className="surface-card" style={{ padding: '1.5rem', background: 'rgba(10,12,16,0.4)', border: '1px solid var(--border-glass)' }}>
                    <span className="sidebar-section-title" style={{ padding: 0 }}>AI TIME SAVED (HOURS)</span>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 0' }}>14.8 Hrs</h3>
                    <div className="sparkline-container" style={{ background: 'rgba(0,229,255,0.02)', border: '1px solid rgba(0,229,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                      <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
                        <defs>
                          <linearGradient id="glow-cyan-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#00E5FF" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0,28 L20,20 L40,15 L60,8 L80,12 L100,2 L100,30 L0,30 Z" fill="url(#glow-cyan-grad)" />
                        <path d="M0,28 L20,20 L40,15 L60,8 L80,12 L100,2" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>

                  <div className="surface-card" style={{ padding: '1.5rem', background: 'rgba(10,12,16,0.4)', border: '1px solid var(--border-glass)' }}>
                    <span className="sidebar-section-title" style={{ padding: 0 }}>PRODUCTIVITY SCORE</span>
                    <h3 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '8px 0 0' }}>94%</h3>
                    <div className="sparkline-container" style={{ background: 'rgba(139,111,255,0.02)', border: '1px solid rgba(139,111,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                      <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
                        <defs>
                          <linearGradient id="glow-violet-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8B6FFF" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#8B6FFF" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0,20 Q20,5 40,12 T80,8 L100,10 L100,30 L0,30 Z" fill="url(#glow-violet-grad)" />
                        <path d="M0,20 Q20,5 40,12 T80,8 L100,10" fill="none" stroke="#8B6FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="bento-grid">
                  <div className="bento-col-6">
                    <ActionItemsPanel />
                  </div>
                  <div className="bento-col-6">
                    <WaitingList />
                  </div>
                </div>
              </div>
            )}

            {/* 7. PRICING & UPGRADES VIEW */}
            {activeView === 'pricing' && (
              <div className="pricing-view-wrapper" style={{ animation: 'fadeInCockpit 0.3s ease-out' }}>
                <PricingPage />
              </div>
            )}

            {/* 8. DOCUMENT INTELLIGENCE HUB */}
            {activeView === 'documents' && (
              <div className="document-intel-deck" style={{ animation: 'fadeInCockpit 0.3s ease-out' }}>
                <DocumentIntelligencePage />
              </div>
            )}

          </div>

        </main>

      </div>
    </div>
  );
};

export default Dashboard;
