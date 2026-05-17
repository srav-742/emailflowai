import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const setupSteps = [
  'Verify the Google account you want to connect.',
  'Approve Gmail and Calendar access on the Google consent screen.',
  'Return to EmailFlow and resume live sync automatically.',
];

const GmailConnect = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [oauthSetup, setOauthSetup] = useState(null);
  const [copied, setCopied] = useState(false);
  const [searchParams] = useSearchParams();
  const { user, gmailReconnectState } = useAuth();
  const navigate = useNavigate();

  const reconnectMode = searchParams.get('mode') === 'reconnect' || gmailReconnectState?.required;
  const heroTitle = reconnectMode
    ? 'Restore Gmail access and resume your live workspace.'
    : 'Connect Gmail once and unlock the full live inbox workflow.';
  const heroBody = reconnectMode
    ? 'EmailFlow already detected that Google revoked or expired one of your refresh tokens. Reconnect below and background sync will resume without disturbing the rest of your workspace.'
    : 'Approve Gmail and Calendar access once so EmailFlow can sync messages, classify priority, surface meetings, and keep your workspace current.';
  const ctaLabel = reconnectMode ? 'Reconnect Gmail' : 'Connect Gmail';

  const statusItems = useMemo(() => ([
    {
      label: 'Workspace',
      value: user?.email || 'Signed in',
      note: reconnectMode ? 'Your account session is healthy. Only Gmail access needs renewal.' : 'Your protected workspace is already ready.',
    },
    {
      label: 'OAuth status',
      value: reconnectMode ? 'Recovery' : 'Ready',
      note: reconnectMode ? 'A fresh Google consent will replace the invalid refresh token.' : 'Google will return you here after approval.',
    },
    {
      label: 'Live sync',
      value: reconnectMode ? 'Paused' : 'Pending',
      note: reconnectMode ? 'Sync resumes automatically after a successful reconnect.' : 'Messages and calendar data start flowing right after connect.',
    },
  ]), [reconnectMode, user?.email]);

  useEffect(() => {
    let active = true;

    const loadOauthSetup = async () => {
      try {
        const response = await authAPI.getGmailAuthUrl();
        if (active) {
          setOauthSetup(response.data);
          setError(null);
        }
      } catch (err) {
        console.error('Gmail setup preload error:', err);
        if (active) {
          setError('We could not load the Gmail authorization details. Please confirm the backend is running and try again.');
        }
      }
    };

    void loadOauthSetup();

    return () => {
      active = false;
    };
  }, []);

  const connectGmail = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = oauthSetup ? { data: oauthSetup } : await authAPI.getGmailAuthUrl();
      if (!oauthSetup) {
        setOauthSetup(response.data);
      }
      window.location.href = response.data.url;
    } catch (err) {
      console.error('Gmail connect error:', err);
      setError('Failed to open the Google authorization screen. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const skipForNow = () => {
    navigate('/dashboard');
  };

  const copyRedirectUri = async () => {
    if (!oauthSetup?.redirectUri) {
      return;
    }

    try {
      await navigator.clipboard.writeText(oauthSetup.redirectUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('Copy redirect URI error:', copyError);
    }
  };

  return (
    <div className="auth-shell auth-shell-wide">
      <section className="auth-hero auth-hero-premium auth-hero-gmail">
        <div className="hero-glow hero-glow-left"></div>
        <div className="hero-glow hero-glow-right"></div>
        <div className="auth-hero-copy">
          <span className="eyebrow">{reconnectMode ? 'Gmail recovery' : 'Gmail authorization'}</span>
          <h1>{heroTitle}</h1>
          <p>{heroBody}</p>
        </div>

        <div className="auth-stage-strip">
          <article className="auth-stage-card">
            <span className="stage-index">01</span>
            <strong>Workspace ready</strong>
            <p>Your secure EmailFlow workspace is already active for {user?.email || 'this account'}.</p>
          </article>
          <article className="auth-stage-card">
            <span className="stage-index">02</span>
            <strong>{reconnectMode ? 'Token renewal' : 'Google consent'}</strong>
            <p>{reconnectMode ? 'Google issues a fresh token set for inbox and calendar access.' : 'Grant Google permissions once to activate full inbox sync.'}</p>
          </article>
          <article className="auth-stage-card">
            <span className="stage-index">03</span>
            <strong>Live sync resumes</strong>
            <p>Messages, replies, and meeting sync come back online automatically after approval.</p>
          </article>
        </div>

        <div className="hero-score-grid">
          {statusItems.map((item) => (
            <article key={item.label} className="hero-score-card">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="auth-card auth-card-spotlight">
        <div className="auth-card-header">
          <span className="brand-mark">GM</span>
          <div>
            <h2>{reconnectMode ? 'Reconnect your Gmail inbox' : 'Connect your Gmail inbox'}</h2>
            <p>{reconnectMode ? 'Replace the expired token and bring live sync back online.' : 'Finish the secure Google authorization step and activate your inbox workspace.'}</p>
          </div>
        </div>

        <div className="connection-status-card">
          <span className="eyebrow">{reconnectMode ? 'Recovery status' : 'Workspace owner'}</span>
          <h3>{user?.name || user?.email || 'EmailFlow user'}</h3>
          <p>
            {reconnectMode
              ? (gmailReconnectState?.message || 'Google access expired for one of your connected inboxes. A fresh Gmail authorization will restore background sync.')
              : 'We use a dedicated Gmail OAuth step so long-lived inbox access is stored safely on the backend and never in the browser.'}
          </p>
        </div>

        <div className="inline-alert warning-alert" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
          <strong style={{ color: '#f59e0b', display: 'block', marginBottom: '0.25rem' }}>Calendar access stays in the same flow</strong>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#d97706' }}>
            When the Google screen opens, approve both Gmail and Calendar scopes so EmailFlow can keep inbox sync,
            meeting sync, and reminder creation active in one pass.
          </p>
        </div>

        {error ? <div className="inline-alert error-alert">{error}</div> : null}

        <div className="oauth-diagnostic-card">
          <div className="oauth-line">
            <span>OAuth client ID</span>
            <code className="oauth-code">{oauthSetup?.clientId || 'Loading...'}</code>
          </div>
          <div className="oauth-line oauth-line-strong">
            <span>Authorized redirect URI</span>
            <code className="oauth-code">{oauthSetup?.redirectUri || 'Loading...'}</code>
          </div>
          <div className="oauth-line">
            <span>Frontend return URL</span>
            <code className="oauth-code">
              {oauthSetup?.frontendUrl ? `${oauthSetup.frontendUrl}/auth/gmail-callback` : 'Loading...'}
            </code>
          </div>
        </div>

        <div className="helper-list">
          {setupSteps.map((step, index) => (
            <div key={step} className="helper-item">
              <strong>Step {index + 1}</strong>
              <span>{step}</span>
            </div>
          ))}
          <div className="helper-item">
            <strong>Secure token storage</strong>
            <span>Gmail access tokens stay on the backend so the reconnect flow restores sync without exposing long-lived credentials in the browser.</span>
          </div>
        </div>

        <div className="button-row">
          <button className="button button-ghost" onClick={copyRedirectUri} disabled={!oauthSetup?.redirectUri}>
            {copied ? 'Redirect copied' : 'Copy redirect URI'}
          </button>
          <button className="button button-primary" onClick={connectGmail} disabled={loading || !oauthSetup?.url}>
            {loading ? 'Opening Google...' : ctaLabel}
          </button>
          <button className="button button-secondary" onClick={skipForNow}>
            {reconnectMode ? 'Back to workspace' : 'Continue without Gmail'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default GmailConnect;
