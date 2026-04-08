import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GmailCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const authError = searchParams.get('error');
  const authStatus = searchParams.get('status');
  const errorMessage = authError
    ? 'Gmail connection failed. Please try again from the connect screen.'
    : authStatus !== 'success'
      ? 'Missing Gmail callback status. Please try connecting Gmail again.'
      : null;
  const statusMessage = authStatus === 'success' ? 'Gmail connected. Loading your workspace...' : 'Finishing Gmail connection...';

  useEffect(() => {
    let timeoutId;

    if (authError) {
      timeoutId = window.setTimeout(() => navigate('/auth/gmail-connect'), 2500);
      return () => window.clearTimeout(timeoutId);
    }

    if (authStatus === 'success') {
      refreshProfile()
        .then(() => {
          timeoutId = window.setTimeout(() => navigate('/dashboard'), 900);
        })
        .catch((error) => {
          console.error('Failed to refresh profile after Gmail callback:', error);
          timeoutId = window.setTimeout(() => navigate('/dashboard'), 1800);
        });

      return () => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    timeoutId = window.setTimeout(() => navigate('/auth/gmail-connect'), 2500);

    return () => window.clearTimeout(timeoutId);
  }, [authError, authStatus, navigate, refreshProfile]);

  return (
    <div className="auth-shell auth-shell-compact">
      <div className="auth-card auth-card-centered">
        <div className="auth-card-header">
          <span className="brand-mark">GM</span>
          <div>
            <h2>{errorMessage ? 'Gmail connection issue' : 'Connecting Gmail to EmailFlow'}</h2>
            <p>{errorMessage || statusMessage}</p>
          </div>
        </div>

        <div className="callback-progress">
          <div className="app-loading-spinner"></div>
        </div>

        <p className="auth-footnote">
          {errorMessage
            ? 'You can retry the Gmail permission step without signing in again.'
            : 'We are syncing your account status and sending you back to the dashboard.'}
        </p>
      </div>
    </div>
  );

  /*
  return (
    <div className="auth-callback">
      {error ? (
        <div className="auth-error">
          <div className="error-icon">❌</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
        </div>
      ) : (
        <div className="auth-loading">
          <div className="spinner"></div>
          <h2>Connecting Gmail...</h2>
          <p>Setting up your email integration</p>
        </div>
      )}
    </div>
  );
  */
};

export default GmailCallback;
