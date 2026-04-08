const StatsOverview = ({ stats }) => {
  if (!stats) return null;

  const highPriority = stats.byPriority?.find((item) => item.priority === 'high')?.count || 0;
  const normalPriority = stats.byPriority?.find((item) => item.priority === 'normal')?.count || 0;
  const clearedRate = stats.totalEmails ? Math.max(0, Math.round(((stats.totalEmails - stats.unreadCount) / stats.totalEmails) * 100)) : 0;

  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <span className="eyebrow">Volume</span>
        <h3>Total emails</h3>
        <strong>{stats.totalEmails}</strong>
        <p>Structured threads stored in your workspace.</p>
        <div className="metric-footnote">Everything synced into one searchable control surface.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Attention</span>
        <h3>Unread</h3>
        <strong>{stats.unreadCount}</strong>
        <p>Messages still waiting to be opened or handled.</p>
        <div className="metric-footnote">{clearedRate}% of the current inbox has already been cleared.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Urgency</span>
        <h3>High priority</h3>
        <strong>{highPriority}</strong>
        <p>Threads flagged as urgent or action-heavy.</p>
        <div className="metric-footnote">Useful for deciding what deserves the first review pass.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Flow</span>
        <h3>Action required</h3>
        <strong>{stats.actionRequired || normalPriority}</strong>
        <p>Emails that likely need a review, decision, or reply.</p>
        <div className="metric-footnote">A compact queue for decisions, approvals, and responses.</div>
      </div>
    </div>
  );

  /*
  return (
    <div className="stats-overview">
      <div className="stat-card">
        <div className="stat-icon">📧</div>
        <div className="stat-info">
          <h3>Total Emails</h3>
          <p className="stat-value">{stats.totalEmails}</p>
        </div>
      </div>

      <div className="stat-card">
        <div className="stat-icon">📖</div>
        <div className="stat-info">
          <h3>Unread</h3>
          <p className="stat-value unread">{stats.unreadCount}</p>
        </div>
      </div>

      {stats.byPriority.map(priority => (
        <div key={priority.priority} className="stat-card">
          <div className="stat-icon">
            {priority.priority === 'high' ? '🔥' : priority.priority === 'low' ? '📭' : '📋'}
          </div>
          <div className="stat-info">
            <h3>{priority.priority.charAt(0).toUpperCase() + priority.priority.slice(1)}</h3>
            <p className="stat-value">{priority.count}</p>
          </div>
        </div>
      ))}
    </div>
  );
  */
};

export default StatsOverview;
