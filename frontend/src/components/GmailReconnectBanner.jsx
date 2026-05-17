import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GmailReconnectBanner = () => {
  const navigate = useNavigate();
  const { gmailReconnectState, clearGmailReconnectRequired } = useAuth();

  if (!gmailReconnectState?.required) {
    return null;
  }

  return (
    <div className="gmail-reconnect-banner">
      <div className="gmail-reconnect-copy">
        <span className="eyebrow">Gmail recovery</span>
        <h3>Reconnect Gmail to resume live sync</h3>
        <p>{gmailReconnectState.message || 'Google access expired for one of your connected inboxes.'}</p>
      </div>

      <div className="button-row">
        <button
          className="button button-primary"
          onClick={() => navigate('/auth/gmail-connect?mode=reconnect')}
        >
          Reconnect Gmail
        </button>
        <button
          className="button button-ghost"
          onClick={() => navigate('/settings/accounts')}
        >
          Review accounts
        </button>
        <button
          className="button button-secondary"
          onClick={clearGmailReconnectRequired}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default GmailReconnectBanner;
