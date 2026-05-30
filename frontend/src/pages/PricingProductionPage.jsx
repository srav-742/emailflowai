import React, { useState } from 'react';
import api from '../services/api';
import './PricingPage.css'; // Reusing existing styles per constraint to not change existing code

export const billingProductionAPI = {
  createCheckout: (priceId) => api.post('/v2/billing/checkout', { priceId }),
  createPortal: () => api.post('/v2/billing/portal'),
  getSubscription: () => api.get('/v2/billing/subscription'),
};

const PricingProductionPage = () => {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loading, setLoading] = useState(null);

  const handleSubscribe = async (planKey) => {
    try {
      setLoading(planKey);
      
      const planSlug = billingCycle === 'monthly' ? planKey : `${planKey}-annual`;
      // Call production endpoint
      const response = await billingProductionAPI.createCheckout(planSlug);
      
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout session. Ensure STRIPE_SECRET_KEY is configured on the backend.');
    } finally {
      setLoading(null);
    }
  };

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: { monthly: 0, yearly: 0 },
      description: 'Ideal for individuals starting out with AI email management.',
      features: [
        { label: '1 Connected Email Account', included: true },
        { label: '50 AI Summaries per month', included: true },
        { label: '100MB Attachment Storage', included: true },
        { label: 'Rule-based categorization', included: true },
        { label: 'Automation & workflows', included: false },
        { label: 'Team collaboration seats', included: false }
      ],
      buttonText: 'Current Plan',
      action: null,
      disabled: true,
      popular: false
    },
    {
      id: 'pro',
      name: 'Pro',
      price: { monthly: 12, yearly: 8.25 },
      billingText: { monthly: 'billed monthly', yearly: 'billed $99/year (Save 30%)' },
      description: 'Unlock high-volume AI workflows, deep brief generation, and intelligence.',
      features: [
        { label: '10 Connected Email Accounts', included: true },
        { label: 'Unlimited AI Summaries', included: true },
        { label: '5GB Secure Attachment Storage', included: true },
        { label: 'AI draft campaigns & replies', included: true },
        { label: 'Full automation & rules engine', included: true },
        { label: 'Priority Support channel', included: true }
      ],
      buttonText: 'Upgrade to Pro',
      action: 'pro',
      disabled: false,
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: { monthly: 299, yearly: 249 },
      billingText: { monthly: 'billed monthly', yearly: 'billed $2990/year (Save 17%)' },
      description: 'Custom security, training profiles, and dedicated resources.',
      features: [
        { label: 'Unlimited Email Accounts', included: true },
        { label: 'Unlimited AI actions & summaries', included: true },
        { label: 'Unlimited secure storage', included: true },
        { label: 'SSO/SAML login integration', included: true },
        { label: 'Custom fine-tuned AI model', included: true },
        { label: 'Dedicated Account Manager & SLA', included: true }
      ],
      buttonText: 'Contact Enterprise',
      action: 'enterprise',
      disabled: false,
      popular: false
    }
  ];

  return (
    <div className="pricing-page-shell">
      <div className="pricing-page-hero">
        <span className="pricing-eyebrow">PRODUCTION BILLING</span>
        <h1 className="pricing-title">Flexible Pricing, Built for Scale</h1>
        <p className="pricing-subtitle">
          Supercharge your inbox with state-of-the-art AI analysis, secure team collaboration, and seamless search.
        </p>

        <div className="billing-cycle-toggle-wrapper">
          <button
            className={`cycle-toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
            onClick={() => setBillingCycle('monthly')}
          >
            Monthly
          </button>
          <button
            className={`cycle-toggle-btn ${billingCycle === 'yearly' ? 'active' : ''}`}
            onClick={() => setBillingCycle('yearly')}
          >
            Yearly <span className="discount-pill">Save up to 30%</span>
          </button>
        </div>
      </div>

      <div className="pricing-cards-grid">
        {plans.map((plan) => {
          const isCurrentLoading = loading === plan.id;
          const displayPrice = billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly;
          const detailText = plan.billingText ? (billingCycle === 'monthly' ? plan.billingText.monthly : plan.billingText.yearly) : 'free forever';

          return (
            <div key={plan.id} className={`pricing-card-glass ${plan.popular ? 'popular-card' : ''}`}>
              {plan.popular && <div className="popular-ribbon">Most Popular</div>}
              
              <div className="pricing-card-header">
                <h3 className="plan-name-badge">{plan.name}</h3>
                <p className="plan-description-text">{plan.description}</p>
                <div className="plan-pricing-holder">
                  <span className="currency-symbol">$</span>
                  <span className="price-value">{displayPrice}</span>
                  <span className="price-period">/mo</span>
                </div>
                <span className="price-details-tag">{detailText}</span>
              </div>

              <div className="pricing-card-action">
                {plan.action ? (
                  <button
                    className={`upgrade-action-btn ${plan.popular ? 'btn-glow-primary' : 'btn-glow-secondary'}`}
                    disabled={isCurrentLoading}
                    onClick={() => handleSubscribe(plan.action)}
                  >
                    {isCurrentLoading ? (
                      <span className="btn-loading-flex">
                        <span className="micro-spinner"></span> Securely Redirecting...
                      </span>
                    ) : (
                      plan.buttonText
                    )}
                  </button>
                ) : (
                  <button className="upgrade-action-btn btn-disabled" disabled={true}>
                    {plan.buttonText}
                  </button>
                )}
              </div>

              <div className="pricing-card-features">
                <h4 className="features-section-title">Included Features:</h4>
                <ul className="features-bullet-list">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className={`feature-bullet-item ${feature.included ? 'included' : 'excluded'}`}>
                      <span className="bullet-icon">{feature.included ? '✓' : '✕'}</span>
                      <span className="bullet-label">{feature.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pricing-page-security-footer">
        <div className="security-icon-shield">🛡</div>
        <p className="security-text">
          PCI-Compliant 256-bit encryption checkout is powered directly by Stripe. Active subscriptions can be canceled or updated anytime via self-service.
        </p>
      </div>
    </div>
  );
};

export default PricingProductionPage;
