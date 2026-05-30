import React, { useState, useEffect } from 'react';
import { billingProductionAPI } from './PricingProductionPage';
import './BillingPortalPage.css';

const BillingPortalPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true);
      const res = await billingProductionAPI.getSubscription();
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load subscription details. Make sure you are logged in and backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      setPortalLoading(true);
      const res = await billingProductionAPI.createPortal();
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error(err);
      alert('Could not generate Stripe Portal link. Make sure you have an active Stripe Customer profile.');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return <div className="billing-portal-shell"><p>Loading billing data...</p></div>;
  }

  if (error) {
    return <div className="billing-portal-shell"><p style={{ color: '#ff4757' }}>{error}</p></div>;
  }

  const { subscription, usage, invoices } = data || {};
  const currentPlan = subscription?.plan || 'free';
  const status = subscription?.status || 'active';

  return (
    <div className="billing-portal-shell">
      <div className="portal-header">
        <h1 className="portal-title">Billing & Subscriptions</h1>
        <p className="portal-subtitle">Manage your plan, usage limits, and billing history.</p>
      </div>

      <div className="portal-grid">
        {/* Subscription Plan Card */}
        <div className="portal-card">
          <h2 className="card-title">Current Plan</h2>
          
          <div className="subscription-details">
            <div className="detail-row">
              <span className="detail-label">Plan Tier</span>
              <span className="detail-value" style={{ textTransform: 'capitalize' }}>{currentPlan}</span>
            </div>
            
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <span className={`status-badge ${status}`}>{status}</span>
            </div>
            
            {subscription?.currentPeriodEnd && (
              <div className="detail-row">
                <span className="detail-label">Current Period Ends</span>
                <span className="detail-value">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </span>
              </div>
            )}
            
            {subscription?.cancelAtPeriodEnd && (
              <div className="detail-row" style={{ color: '#ff4757', marginTop: '10px' }}>
                <span className="detail-label">Note</span>
                <span className="detail-value">Cancels at end of period</span>
              </div>
            )}
          </div>

          <button 
            className="portal-action-btn" 
            onClick={handleManageBilling}
            disabled={portalLoading}
          >
            {portalLoading ? 'Redirecting to Stripe...' : 'Manage Plan & Payments'}
          </button>
        </div>

        {/* Usage Limits Card */}
        <div className="portal-card">
          <h2 className="card-title">Usage & Limits</h2>
          <div className="usage-stats">
            <div className="usage-item">
              <div className="usage-label">
                <span>AI Actions (Monthly)</span>
                <span>{usage?.aiActions?.count || 0} / {usage?.aiActions?.limit || 'Unlimited'}</span>
              </div>
              <div className="usage-bar-bg">
                <div 
                  className="usage-bar-fill" 
                  style={{ 
                    width: usage?.aiActions?.limit 
                      ? `${Math.min(100, ((usage.aiActions.count || 0) / usage.aiActions.limit) * 100)}%` 
                      : '10%' // Indeterminate small bar for unlimited
                  }} 
                />
              </div>
            </div>

            <div className="usage-item">
              <div className="usage-label">
                <span>Connected Accounts</span>
                <span>{usage?.accounts?.count || 0} / {usage?.accounts?.limit || 'Unlimited'}</span>
              </div>
              <div className="usage-bar-bg">
                <div 
                  className="usage-bar-fill" 
                  style={{ 
                    width: usage?.accounts?.limit 
                      ? `${Math.min(100, ((usage.accounts.count || 0) / usage.accounts.limit) * 100)}%` 
                      : '10%'
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className="invoices-section">
        <h2 className="card-title">Billing History</h2>
        {invoices && invoices.length > 0 ? (
          <table className="invoices-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td>${inv.amount.toFixed(2)} {inv.currency}</td>
                  <td>
                    <span className={`status-badge ${inv.status.toLowerCase() === 'paid' ? 'active' : 'canceled'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    {inv.invoicePdf ? (
                      <a href={inv.invoicePdf} target="_blank" rel="noopener noreferrer" className="invoice-link">
                        Download PDF
                      </a>
                    ) : (
                      'N/A'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888', marginTop: '20px' }}>No invoices found.</p>
        )}
      </div>
    </div>
  );
};

export default BillingPortalPage;
