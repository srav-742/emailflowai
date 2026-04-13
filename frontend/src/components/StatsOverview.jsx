const StatsOverview = ({ stats }) => {
  if (!stats) return null;

  const highPriority = stats.byPriority?.find((item) => item.priority === 'high')?.count || 0;
  const clearedRate = stats.totalEmails ? Math.max(0, Math.round(((stats.totalEmails - stats.unreadCount) / stats.totalEmails) * 100)) : 0;
  const followUpCount = stats.followUpCount || 0;

  return (
    <div className="metrics-grid">
      <div className="metric-card">
        <span className="eyebrow">Step 1</span>
        <h3>Total emails</h3>
        <strong>{stats.totalEmails}</strong>
        <p>Messages stored in your workspace.</p>
        <div className="metric-footnote">One place to review everything quickly.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Step 2</span>
        <h3>Unread</h3>
        <strong>{stats.unreadCount}</strong>
        <p>Messages still waiting for review.</p>
        <div className="metric-footnote">{clearedRate}% of the inbox is already cleared.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Step 3</span>
        <h3>High priority</h3>
        <strong>{highPriority}</strong>
        <p>Threads flagged as urgent or time-sensitive.</p>
        <div className="metric-footnote">Start here when you want the fast shortlist.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Step 4</span>
        <h3>Pending tasks</h3>
        <strong>{stats.pendingTaskCount || 0}</strong>
        <p>Action items extracted from email that are still open.</p>
        <div className="metric-footnote">{stats.taskCount || 0} total tasks detected so far.</div>
      </div>

      <div className="metric-card">
        <span className="eyebrow">Step 5</span>
        <h3>Needs reply</h3>
        <strong>{followUpCount}</strong>
        <p>Sent threads that need a follow-up.</p>
        <div className="metric-footnote">Helpful for not missing important conversations.</div>
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
