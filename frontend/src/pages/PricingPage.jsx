import React, { useState } from 'react';
import { billingAPI } from '../services/api';
import './PricingPage.css';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    description: 'Perfect for getting started with AI email management.',
    features: [
      'Smart Inbox Tabs',
      'Basic AI Summaries',
      '10 AI Actions/day',
      'Community Support'
    ],
    buttonText: 'Current Plan',
    disabled: true,
  },
  {
    id: 'pro_monthly',
    name: 'Pro Monthly',
    price: '$12',
    period: '/month',
    description: 'Unlock full power with unlimited AI and deep briefings.',
    features: [
      'Everything in Free',
      'Unlimited AI Actions',
      'Deep AI Briefings',
      'Priority Support',
      'Early Access to Features'
    ],
    buttonText: 'Upgrade to Pro',
    priceId: import.meta.env.VITE_STRIPE_PRO_MONTHLY_PRICE_ID,
    recommended: true,
  },
  {
    id: 'pro_annual',
    name: 'Pro Annual',
    price: '$99',
    period: '/year',
    description: 'Save 30% with yearly billing. The choice of professionals.',
    features: [
      'Everything in Pro Monthly',
      '2 Months Free',
      'VIP Support Channel',
      'Custom Style Profiles'
    ],
    buttonText: 'Get Annual Pro',
    priceId: import.meta.env.VITE_STRIPE_PRO_ANNUAL_PRICE_ID,
  }
];

const PricingPage = () => {
  const [loading, setLoading] = useState(null);

  const handleSubscribe = async (priceId, planId) => {
    if (!priceId) return;
    try {
      setLoading(planId);
      const response = await billingAPI.createCheckout(priceId);
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <span className="eyebrow">Flexible Plans</span>
        <h1>Elevate your inbox intelligence</h1>
        <p>Choose the plan that fits your professional workflow.</p>
      </div>

      <div className="pricing-grid">
        {PLANS.map((plan) => (
          <div key={plan.id} className={`pricing-card ${plan.recommended ? 'recommended' : ''}`}>
            {plan.recommended && <div className="recommended-badge">Most Popular</div>}
            <div className="plan-name">{plan.name}</div>
            <div className="plan-price">
              <span className="amount">{plan.price}</span>
              {plan.period && <span className="period">{plan.period}</span>}
            </div>
            <p className="plan-description">{plan.description}</p>
            
            <button 
              className={`button ${plan.recommended ? 'button-primary' : 'button-secondary'}`}
              disabled={plan.disabled || loading === plan.id}
              onClick={() => handleSubscribe(plan.priceId, plan.id)}
            >
              {loading === plan.id ? 'Redirecting...' : plan.buttonText}
            </button>

            <ul className="plan-features">
              {plan.features.map((feature, i) => (
                <li key={i}>
                  <span className="check">✓</span> {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="pricing-footer">
        <p>Secure payments processed by Stripe. Cancel anytime.</p>
      </div>
    </div>
  );
};

export default PricingPage;
