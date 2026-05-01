import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AccountSwitcher from './AccountSwitcher';

const shellNavItems = [
  { path: '/dashboard', label: 'Dashboard', kicker: 'Overview' },
  { path: '/emails', label: 'Inbox', kicker: 'All threads' },
  { path: '/finance', label: 'Finance', kicker: 'Payments and receipts' },
  { path: '/developer', label: 'Developer', kicker: 'Deploys and incidents' },
  { path: '/meetings', label: 'Meetings', kicker: 'Calendar and agenda' },
  { path: '/newsletter', label: 'Newsletters', kicker: 'Read later' },
  { path: '/social', label: 'Social', kicker: 'Community updates' },
  { path: '/focus', label: 'Focus Today', kicker: 'Immediate action' },
  { path: '/read-later', label: 'Read Later', kicker: 'When you have time' },
  { path: '/newsletters', label: 'Newsletters', kicker: 'Favorite publications' },
  { path: '/waiting', label: 'Waiting for Reply', kicker: 'Expectations' },
  { path: '/settings/digest', label: 'Digest Settings', kicker: 'Personalization' },
  { path: '/settings/accounts', label: 'Gmail Accounts', kicker: 'Multi-account setup' },
];

const pageTitles = {
  '/dashboard': 'Daily command center',
  '/emails': 'Inbox command center',
  '/finance': 'Finance queue',
  '/developer': 'Developer queue',
  '/meetings': 'Meetings and calendar',
  '/newsletter': 'Newsletters and promos',
  '/social': 'Social and community',
  '/focus': 'Focus Today',
  '/read-later': 'Read Later',
  '/newsletters': 'Newsletters',
  '/waiting': 'Waiting for Reply',
  '/settings/digest': 'Morning Brief Settings',
  '/settings/accounts': 'Account Operations',
};

const pageDescriptions = {
  '/dashboard': 'A premium control room for summaries, triage, and daily inbox momentum.',
  '/emails': 'Review the full stream, search instantly, and process threads without noise.',
  '/finance': 'Invoices, receipts, payment asks, and approvals gathered into one lane.',
  '/developer': 'Deployments, incidents, pull requests, and engineering notifications.',
  '/meetings': 'Schedules, invites, agendas, and follow-up threads with less clutter.',
  '/newsletter': 'A calm read-later stack for promos, product updates, and newsletters.',
  '/social': 'Community notifications and lower-priority social traffic in one place.',
  '/focus': 'High-priority emails identified by AI as needing immediate focus.',
  '/read-later': 'A collection of interesting content and threads you saved for later.',
  '/newsletters': 'Cleaned and separated newsletter feeds to reduce inbox noise.',
  '/waiting': 'Threads where you sent a message and are still waiting for a response.',
  '/settings/digest': 'Customize your daily AI-powered intelligence summary.',
  '/settings/accounts': 'Manage multiple Gmail connections, sync settings, and UI identities.',
};

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const currentTitle = pageTitles[location.pathname] || 'EmailFlow AI';
  const currentDescription = pageDescriptions[location.pathname] || 'Run your inbox like a focused operations desk.';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell" data-legacy-count={shellNavItems.length}>
      <aside className={`app-sidebar ${sidebarOpen ? 'expanded' : 'collapsed'}`}>
        <div className="brand-lockup">
          <button className="brand-badge" onClick={() => navigate('/dashboard')}>
            EF
          </button>
          {sidebarOpen && (
            <div>
              <p className="brand-title">EmailFlow AI</p>
              <p className="brand-subtitle">AI-first inbox operations</p>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <AccountSwitcher sidebarOpen={sidebarOpen} />
          
          <div style={{ height: '1.5rem' }}></div>

          {shellNavItems.map((item) => {
            const active = location.pathname === item.path;

            return (
              <button key={item.path} className={`sidebar-link ${active ? 'active' : ''}`} onClick={() => navigate(item.path)}>
                <span className="sidebar-link-line"></span>
                {sidebarOpen && (
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.kicker}</small>
                  </span>
                )}
                {!sidebarOpen && <strong>{item.label.slice(0, 2)}</strong>}
              </button>
            );
          })}
        </nav>

        {sidebarOpen && (
          <div className="sidebar-pulse-card">
            <span className="eyebrow">Command mode</span>
            <h3>Less inbox anxiety, more clean signal.</h3>
            <p>EmailFlow keeps finance, developer, meeting, and newsletter traffic separated so your day stays readable.</p>
          </div>
        )}

        <div className="sidebar-footer-card">
          <div className="user-chip">
            <span className="user-avatar" style={{ background: user?.hasGmailAccess ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, var(--accent), var(--cyan))' }}>
              {(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}
            </span>
            {sidebarOpen && (
              <div>
                <strong>{user?.name || 'Workspace owner'}</strong>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{user?.email}</span>
              </div>
            )}
          </div>

          {sidebarOpen && (
            <div className="status-stack" style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', borderRadius: '10px', background: user?.hasGmailAccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', border: '1px solid currentColor', color: user?.hasGmailAccess ? '#34d399' : '#fbbf24', fontSize: '0.75rem', fontWeight: 600 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', boxShadow: '0 0 8px currentColor' }}></span>
                {user?.hasGmailAccess ? 'GMAIL CONNECTED' : 'GMAIL DISCONNECTED'}
              </div>
            </div>
          )}

          <div className="button-row" style={{ marginTop: '1rem' }}>
            <button className="button button-ghost" style={{ flex: 1, padding: '0.6rem' }} onClick={() => setSidebarOpen((value) => !value)}>
              {sidebarOpen ? 'Collapse' : '->'}
            </button>
            {sidebarOpen && (
              <button className="button button-logout" style={{ flex: 2, padding: '0.6rem' }} onClick={handleLogout}>
                Logout
              </button>
            )}
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="page-header">
          <div>
            <span className="eyebrow">Workspace / EmailFlow AI</span>
            <h1>{currentTitle}</h1>
            <p className="page-subtitle">{currentDescription}</p>
          </div>

          <div className="header-actions">
            {!user?.hasGmailAccess && (
              <button className="button button-primary" onClick={() => navigate('/auth/gmail-connect')}>
                Connect Gmail
              </button>
            )}
            <button className="button button-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
};

export default Layout;
