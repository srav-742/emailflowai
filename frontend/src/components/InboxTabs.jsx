import React, { useEffect, useState } from 'react';
import { emailAPI } from '../services/api';
import './InboxTabs.css';

const TABS = [
  { id: 'focus_today', label: 'Focus Today', icon: '🔥' },
  { id: 'read_later', label: 'Read Later', icon: '📚' },
  { id: 'newsletter', label: 'Newsletters', icon: '📧' },
  { id: 'waiting', label: 'Waiting for Reply', icon: '⏳' },
];

const InboxTabs = ({ activeTab, onTabChange }) => {
  const [counts, setCounts] = useState({ focus_today: 0, read_later: 0, newsletter: 0, waiting: 0 });

  const fetchCounts = async () => {
    try {
      const response = await emailAPI.getCategoryCounts();
      setCounts(response.data);
    } catch (error) {
      console.error('Failed to fetch counts:', error);
    }
  };

  useEffect(() => {
    fetchCounts();
    // Poll for updates every 2 minutes
    const interval = setInterval(fetchCounts, 120000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="inbox-tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`inbox-tab-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
          {counts[tab.id] > 0 && (
            <span className="tab-badge">{counts[tab.id]}</span>
          )}
        </button>
      ))}
    </div>
  );
};

export default InboxTabs;
