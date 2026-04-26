import React from 'react';
import { useNavigate } from 'react-router-dom';
import './UpgradeModal.css';

const UpgradeModal = ({ isOpen, onClose, featureName = 'This feature' }) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content upgrade-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upgrade-icon">🚀</div>
        <h2>Unlock {featureName}</h2>
        <p>You've reached the limit of the Free plan. Upgrade to Pro to get unlimited access and advanced AI features.</p>
        
        <ul className="upgrade-benefits">
          <li>✓ Unlimited AI Summaries & Extractions</li>
          <li>✓ Priority email processing</li>
          <li>✓ Advanced style profile analysis</li>
          <li>✓ 24/7 Priority support</li>
        </ul>

        <div className="modal-actions">
          <button className="button button-ghost" onClick={onClose}>Maybe later</button>
          <button 
            className="button button-primary" 
            onClick={() => {
              onClose();
              navigate('/pricing');
            }}
          >
            See Pricing Plans
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
