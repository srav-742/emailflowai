import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GmailCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile, clearGmailReconnectRequired, markGmailReconnectRequired } = useAuth();
  const authError = searchParams.get('error');
  const authStatus = searchParams.get('status');
  const errorMessage = authError
    ? 'Gmail authorization did not complete. You can retry immediately.'
    : authStatus !== 'success'
      ? 'Missing Gmail callback status. Please reconnect Gmail again.'
      : null;
  const statusMessage = authStatus === 'success'
    ? 'Gmail connected. Finalizing your workspace now...'
    : 'Finalizing Gmail authorization...';

  useEffect(() => {
    let active = true;

    if (authError) {
      markGmailReconnectRequired({
        message: 'Google authorization was interrupted. Please reconnect Gmail to resume sync.',
        source: 'callback',
      });
      return () => {
        active = false;
      };
    }

    if (authStatus === 'success') {
      refreshProfile()
        .then(() => {
          if (!active) {
            return;
          }

          clearGmailReconnectRequired();
          navigate('/dashboard', { replace: true });
        })
        .catch((error) => {
          console.error('Failed to refresh profile after Gmail callback:', error);
          if (!active) {
            return;
          }

          navigate('/dashboard', { replace: true });
        });

      return () => {
        active = false;
      };
    }

    markGmailReconnectRequired({
      message: 'Gmail authorization did not finish correctly. Please reconnect Gmail.',
      source: 'callback',
    });

    return () => {
      active = false;
    };
  }, [authError, authStatus, clearGmailReconnectRequired, markGmailReconnectRequired, navigate, refreshProfile]);

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

        <div className="callback-step-list">
          <div className={`callback-step ${authError ? 'callback-step-warning' : 'callback-step-complete'}`}>
            <strong>Google returned to EmailFlow</strong>
            <span>{authError ? 'Authorization needs one more attempt.' : 'Callback received successfully.'}</span>
          </div>
          <div className={`callback-step ${authStatus === 'success' ? 'callback-step-active' : ''}`}>
            <strong>Workspace tokens syncing</strong>
            <span>{authStatus === 'success' ? 'Refreshing your account state now.' : 'Waiting for a successful Gmail approval.'}</span>
          </div>
          <div className="callback-step">
            <strong>Dashboard handoff</strong>
            <span>{authError ? 'Use the reconnect action below to retry immediately.' : 'You will land back in the app as soon as sync completes.'}</span>
          </div>
        </div>

        <p className="auth-footnote">
          {errorMessage
            ? 'You can retry the Gmail permission step without signing in again.'
            : 'We are syncing your account status and returning you to the dashboard without an extra wait.'}
        </p>

        {errorMessage ? (
          <div className="button-row">
            <button className="button button-primary" onClick={() => navigate('/auth/gmail-connect?mode=reconnect')}>
              Reconnect Gmail
            </button>
            <button className="button button-ghost" onClick={() => navigate('/dashboard')}>
              Back to workspace
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default GmailCallback;
