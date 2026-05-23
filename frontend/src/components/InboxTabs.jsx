import { useEffect, useState } from 'react';
import { emailAPI } from '../services/api';
import './InboxTabs.css';

const TABS = [
  { id: 'all', label: 'All Mail', icon: 'ALL', description: 'Every synced email' },
  { id: 'focus_today', label: 'Focus Today', icon: 'HOT', description: 'Urgent attention needed' },
  { id: 'read_later', label: 'Read Later', icon: 'SAVE', description: 'Non-urgent information' },
  { id: 'newsletter', label: 'Newsletters', icon: 'MAIL', description: 'Bulk and marketing' },
  { id: 'waiting', label: 'Waiting for Reply', icon: 'WAIT', description: 'No response yet' },
];

const InboxTabs = ({ activeTab, onTabChange, accountId = null }) => {
  const [counts, setCounts] = useState({ all: 0, focus_today: 0, read_later: 0, newsletter: 0, waiting: 0 });

  useEffect(() => {
    let mounted = true;

    const fetchCounts = async () => {
      try {
        const response = await emailAPI.getCategoryCounts(accountId ? { accountId } : {});
        if (mounted) setCounts(response.data);
      } catch (error) {
        console.error('Failed to fetch counts:', error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 120000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [accountId]);

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
            {counts[tab.id] > 0 ? <span className="tab-badge">{counts[tab.id]}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
};

export default InboxTabs;
