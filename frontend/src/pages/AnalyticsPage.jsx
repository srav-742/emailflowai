import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        
        const [summaryRes, sendersRes, categoriesRes] = await Promise.all([
          axios.get('/api/analytics/summary', { headers }),
          axios.get('/api/analytics/senders', { headers }),
          axios.get('/api/analytics/categories', { headers }),
        ]);

        setData({
          totals: summaryRes.data.totals,
          daily: summaryRes.data.daily,
          topSenders: sendersRes.data,
          categories: categoriesRes.data
        });
      } catch (err) {
        console.error('Analytics fetch error:', err);
        setError('Failed to load analytics. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
        <p>Calculating your productivity gains...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p className="error-message">{error}</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <span className="eyebrow">Insights & Performance</span>
        <h1>Analytics Dashboard</h1>
        <p>Visualize your email productivity and time saved with AI.</p>
      </header>

      <AnalyticsDashboard data={data} />
    </div>
  );
};

export default AnalyticsPage;
