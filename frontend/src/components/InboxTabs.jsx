import React, { useEffect, useState } from 'react';
import { emailAPI } from '../services/api';
import './InboxTabs.css';

const TABS = [
  { id: 'focus_today', label: 'Focus Today', icon: '🔥', description: 'Urgent attention needed' },
  { id: 'read_later', label: 'Read Later', icon: '📚', description: 'Non-urgent information' },
  { id: 'newsletter', label: 'Newsletters', icon: '📧', description: 'Bulk & marketing' },
  { id: 'waiting', label: 'Waiting for Reply', icon: '⏳', description: 'No response yet' },
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
    <div className="inbox-tabs-container">
      <div className="inbox-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`inbox-tab-item ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
            title={tab.description}
          >
            <div className="tab-main">
              <span className="tab-icon">{tab.icon}</span>
              <div className="tab-text">
                <span className="tab-label">{tab.label}</span>
                <span className="tab-desc">{tab.description}</span>
              </div>
            </div>
            {counts[tab.id] > 0 && (
              <span className="tab-badge">{counts[tab.id]}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default InboxTabs;
