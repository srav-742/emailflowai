import React, { useState, useEffect } from 'react';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import RecoverableErrorState from '../components/RecoverableErrorState';
import api from '../services/api';

const AnalyticsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, sendersRes, categoriesRes] = await Promise.all([
        api.get('/analytics/summary'),
        api.get('/analytics/senders'),
        api.get('/analytics/categories'),
      ]);

      setData({
        totals: summaryRes.data.totals,
        daily: summaryRes.data.daily,
        topSenders: sendersRes.data,
        categories: categoriesRes.data,
      });
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError(err.response?.data?.error || 'Failed to load analytics. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
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
      <RecoverableErrorState
        title="Analytics are temporarily unavailable"
        message={error}
        retryLabel="Retry analytics"
        onRetry={() => void fetchData()}
      />
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
