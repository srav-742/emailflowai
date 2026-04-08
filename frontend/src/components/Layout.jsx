import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const shellNavItems = [
  { path: '/dashboard', label: 'Dashboard', kicker: 'Overview' },
  { path: '/emails', label: 'Inbox', kicker: 'All threads' },
  { path: '/finance', label: 'Finance', kicker: 'Payments and receipts' },
  { path: '/developer', label: 'Developer', kicker: 'Deploys and incidents' },
  { path: '/meetings', label: 'Meetings', kicker: 'Calendar and agenda' },
  { path: '/newsletter', label: 'Newsletters', kicker: 'Read later' },
  { path: '/social', label: 'Social', kicker: 'Community updates' },
];

const pageTitles = {
  '/dashboard': 'Daily command center',
  '/emails': 'Inbox command center',
  '/finance': 'Finance queue',
  '/developer': 'Developer queue',
  '/meetings': 'Meetings and calendar',
  '/newsletter': 'Newsletters and promos',
  '/social': 'Social and community',
};

const pageDescriptions = {
  '/dashboard': 'A premium control room for summaries, triage, and daily inbox momentum.',
  '/emails': 'Review the full stream, search instantly, and process threads without noise.',
  '/finance': 'Invoices, receipts, payment asks, and approvals gathered into one lane.',
  '/developer': 'Deployments, incidents, pull requests, and engineering notifications.',
  '/meetings': 'Schedules, invites, agendas, and follow-up threads with less clutter.',
  '/newsletter': 'A calm read-later stack for promos, product updates, and newsletters.',
  '/social': 'Community notifications and lower-priority social traffic in one place.',
};

const Layout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const currentTitle = pageTitles[location.pathname] || 'EmailFlow AI';
  const currentDescription = pageDescriptions[location.pathname] || 'Run your inbox like a focused operations desk.';
  const lastSyncLabel = user?.lastSyncAt
    ? new Date(user.lastSyncAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'No sync yet';

  const navItems = [
    { path: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { path: '/emails', icon: '📧', label: 'All Emails' },
    { path: '/important', icon: '⭐', label: 'Important' },
    { path: '/promotions', icon: '🎁', label: 'Promotions' },
    { path: '/social', icon: '👥', label: 'Social' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell" data-legacy-count={navItems.length}>
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
            <span className="user-avatar">{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</span>
            {sidebarOpen && (
              <div>
                <strong>{user?.name || 'Workspace owner'}</strong>
                <span>{user?.email}</span>
              </div>
            )}
          </div>

          {sidebarOpen && (
            <div className="status-stack">
              <span className={`status-pill ${user?.hasGmailAccess ? 'status-ok' : 'status-warn'}`}>
                {user?.hasGmailAccess ? 'Gmail connected' : 'Gmail needs approval'}
              </span>
            </div>
          )}

          <div className="button-row">
            <button className="button button-ghost" onClick={() => setSidebarOpen((value) => !value)}>
              {sidebarOpen ? 'Collapse' : 'Expand'}
            </button>
            {sidebarOpen && (
              <button className="button button-secondary" onClick={handleLogout}>
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
            <span className={`status-pill ${user?.hasGmailAccess ? 'status-ok' : 'status-warn'}`}>
              {user?.hasGmailAccess ? 'Gmail connected' : 'Gmail needs approval'}
            </span>
            <span className="status-pill">Last sync {lastSyncLabel}</span>
            <button className="button button-ghost" onClick={() => navigate('/auth/gmail-connect')}>
              {user?.hasGmailAccess ? 'Manage Gmail' : 'Connect Gmail'}
            </button>
          </div>
        </header>

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );

  /*
  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo">📧</span>
          {sidebarOpen && <h2>Email AI</h2>}
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {sidebarOpen && <span className="nav-label">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0) || user?.email?.charAt(0)}</div>
            {sidebarOpen && (
              <div className="user-details">
                <p className="user-name">{user?.name || 'User'}</p>
                <p className="user-email">{user?.email}</p>
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            {sidebarOpen ? 'Logout' : '🚪'}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            ☰
          </button>
          <h1 className="page-title">
            {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
          </h1>
        </header>

        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
  */
};

export default Layout;
