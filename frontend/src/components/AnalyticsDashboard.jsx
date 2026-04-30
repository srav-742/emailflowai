import React from 'react';
import {
  LineChart, Line, AreaChart, Area, 
  XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, Legend
} from 'recharts';
import './AnalyticsDashboard.css';

const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#10b981'];

const AnalyticsDashboard = ({ data }) => {
  if (!data) return null;

  const { totals, daily, topSenders, categories } = data;

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const chartData = daily.map(d => ({
    name: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    emails: d.emailsProcessed,
    actions: d.actionsCompleted,
    saved: Math.round(d.timeSavedSeconds / 60), // in minutes
  }));

  const pieData = categories.map(c => ({
    name: c.category.charAt(0).toUpperCase() + c.category.slice(1),
    value: c._count._all || c._count || 0
  }));

  return (
    <div className="analytics-dashboard">
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Time Saved</span>
          <span className="stat-value">{formatTime(totals.timeSavedSeconds)}</span>
          <span className="stat-trend positive">↑ Monthly Efficiency</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Emails Processed</span>
          <span className="stat-value">{totals.emailsProcessed}</span>
          <span className="stat-trend">Total Volume</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Actions Completed</span>
          <span className="stat-value">{totals.actionsCompleted}</span>
          <span className="stat-trend positive">✓ Task Velocity</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Follow-ups Sent</span>
          <span className="stat-value">{totals.followupsSent}</span>
          <span className="stat-trend">Relationships Managed</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container large">
          <h3>Inbox Productivity Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="saved" name="Minutes Saved" stroke="#6366f1" fillOpacity={1} fill="url(#colorSaved)" />
              <Line type="monotone" dataKey="emails" name="Emails" stroke="#a855f7" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Category Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <h3>Top Contacts</h3>
          <div className="senders-list">
            {topSenders.slice(0, 5).map((sender, idx) => (
              <div key={idx} className="sender-item">
                <div className="sender-info">
                  <span className="sender-name">{sender.senderName || sender.sender.split('@')[0]}</span>
                  <span className="sender-email">{sender.sender}</span>
                </div>
                <span className="sender-count">{sender._count._all} emails</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
