import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const setupSteps = [
  'Open Google Cloud Console and edit the OAuth 2.0 Client ID used by EmailFlow.',
  'Paste the exact Authorized redirect URI shown below into the Google OAuth client settings.',
  'Save the credentials, return here, and click Connect Gmail again.',
];

const GmailConnect = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [oauthSetup, setOauthSetup] = useState(null);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const loadOauthSetup = async () => {
      try {
        const response = await authAPI.getGmailAuthUrl();
        if (active) {
          setOauthSetup(response.data);
        }
      } catch (err) {
        console.error('Gmail setup preload error:', err);
        if (active) {
          setError('We could not load the Gmail OAuth configuration. Please confirm the backend is running.');
        }
      }
    };

    loadOauthSetup();

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
      // Redirect to Google OAuth for Gmail permissions
      window.location.href = response.data.url;
    } catch (err) {
      console.error('Gmail connect error:', err);
      setError('Failed to connect Gmail. Please try again.');
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
    } catch (error) {
      console.error('Copy redirect URI error:', error);
    }
  };

  return (
    <div className="auth-shell auth-shell-wide">
      <section className="auth-hero auth-hero-premium auth-hero-gmail">
        <div className="hero-glow hero-glow-left"></div>
        <div className="hero-glow hero-glow-right"></div>
        <div className="auth-hero-copy">
          <span className="eyebrow">Gmail authorization</span>
          <h1>One exact redirect URI unlocks live inbox sync.</h1>
          <p>
            Your Google screen is failing because the OAuth client in Google Cloud does not yet trust the redirect URI
            the app is sending. EmailFlow now shows that exact URI below so you can fix it without guessing.
          </p>
        </div>

        <div className="auth-stage-strip">
          <article className="auth-stage-card">
            <span className="stage-index">01</span>
            <strong>Firebase sign-in</strong>
            <p>Your private workspace is already created for {user?.email || 'this account'}.</p>
          </article>
          <article className="auth-stage-card">
            <span className="stage-index">02</span>
            <strong>Gmail consent</strong>
            <p>Google needs one matching callback URL before it will grant Gmail access.</p>
          </article>
          <article className="auth-stage-card">
            <span className="stage-index">03</span>
            <strong>Live sync</strong>
            <p>Once approved, EmailFlow can fetch emails, summarize, classify, and send replies.</p>
          </article>
        </div>

        <div className="hero-score-grid">
          <article className="hero-score-card">
            <strong>OAuth</strong>
            <span>Exact match required</span>
            <p>Google rejects even a one-port difference in the redirect URI.</p>
          </article>
          <article className="hero-score-card">
            <strong>Secure</strong>
            <span>Backend token storage</span>
            <p>Gmail tokens are stored server-side in PostgreSQL-linked user records.</p>
          </article>
          <article className="hero-score-card">
            <strong>Ready</strong>
            <span>AI inbox actions</span>
            <p>Summaries, categories, drafts, and send flow are ready after this step.</p>
          </article>
        </div>
      </section>

      <section className="auth-card auth-card-spotlight">
        <div className="auth-card-header">
          <span className="brand-mark">GM</span>
          <div>
            <h2>Connect your Gmail inbox</h2>
            <p>Finish the integration with the exact Google OAuth settings this app expects.</p>
          </div>
        </div>

        <div className="connection-status-card">
          <span className="eyebrow">Workspace owner</span>
          <h3>{user?.name || user?.email || 'EmailFlow user'}</h3>
          <p>We use a separate Gmail OAuth step so long-lived inbox access is stored safely on the backend and never in the browser.</p>
        </div>

        {error && <div className="inline-alert error-alert">{error}</div>}

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
            <strong>Why error 400 happens</strong>
            <span>The Google OAuth client does not contain the exact redirect URI shown above, so Google blocks the request before returning to EmailFlow.</span>
          </div>
        </div>

        <div className="button-row">
          <button className="button button-ghost" onClick={copyRedirectUri} disabled={!oauthSetup?.redirectUri}>
            {copied ? 'Redirect copied' : 'Copy redirect URI'}
          </button>
          <button className="button button-primary" onClick={connectGmail} disabled={loading || !oauthSetup?.url}>
            {loading ? 'Redirecting to Gmail...' : 'Connect Gmail'}
          </button>
          <button className="button button-secondary" onClick={skipForNow}>
            Continue without Gmail
          </button>
        </div>
      </section>
    </div>
  );

  /*
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">📧</div>
          <h1>Connect Your Gmail</h1>
          <p>Grant access to fetch and manage your emails</p>
        </div>

        {error && (
          <div className="error-message" style={{ color: 'red', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#fee', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">📨</span>
            <div>
              <h3>Fetch Emails</h3>
              <p>Import your emails from Gmail</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🤖</span>
            <div>
              <h3>AI Processing</h3>
              <p>Summarize and classify emails</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔒</span>
            <div>
              <h3>Secure Access</h3>
              <p>Your data is encrypted and private</p>
            </div>
          </div>
        </div>

        <button
          className="google-login-btn"
          onClick={connectGmail}
          disabled={loading}
          style={{ marginBottom: '1rem' }}
        >
          {loading ? (
            'Connecting...'
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Connect with Gmail
            </>
          )}
        </button>

        <button
          onClick={skipForNow}
          style={{
            background: 'none',
            border: 'none',
            color: '#667eea',
            cursor: 'pointer',
            fontSize: '0.9rem',
            textDecoration: 'underline'
          }}
        >
          Skip for now (Limited functionality)
        </button>
      </div>
    </div>
  );
  */
};

export default GmailConnect;
