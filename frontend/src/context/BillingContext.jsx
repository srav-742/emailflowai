import React, { createContext, useContext, useState, useEffect } from 'react';
import UpgradeModal from '../components/UpgradeModal';
import { billingAPI } from '../services/api';
import { useAuth } from './AuthContext';

const BillingContext = createContext(null);

export const BillingProvider = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [requiredFeature, setRequiredFeature] = useState('');

  const fetchSubscription = async () => {
    try {
      const response = await billingAPI.getSubscription();
      setSubscription(response.data.subscription);
    } catch (error) {
      console.error('[Billing] Failed to fetch subscription:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSubscription();
    } else {
      setSubscription(null);
    }
  }, [user]);

  const triggerUpgradeModal = (feature = 'This feature') => {
    setRequiredFeature(feature);
    setIsUpgradeModalOpen(true);
  };

  const isPro = subscription?.plan === 'pro' || user?.plan === 'pro';

  return (
    <BillingContext.Provider value={{ 
      subscription, 
      isPro, 
      triggerUpgradeModal, 
      refreshSubscription: fetchSubscription 
    }}>
      {children}
      <UpgradeModal 
        isOpen={isUpgradeModalOpen} 
        onClose={() => setIsUpgradeModalOpen(false)} 
        featureName={requiredFeature}
      />
    </BillingContext.Provider>
  );
};

export const useBilling = () => {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBilling must be used within a BillingProvider');
  }
  return context;
};
