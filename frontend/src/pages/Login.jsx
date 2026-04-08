import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const launchSteps = [
  { label: 'Sign in', detail: 'Firebase login creates your private workspace with your Google identity.' },
  { label: 'Connect Gmail', detail: 'A backend OAuth step then stores long-lived Gmail access safely on the server.' },
  { label: 'Operate', detail: 'EmailFlow surfaces AI summaries, queues, and reply drafts once Gmail is connected.' },
];

const proofPoints = [
  { value: '4', label: 'Focused lanes', note: 'Finance, developer, meetings, read later' },
  { value: 'AI', label: 'Copilot actions', note: 'Summaries, classification, reply generation' },
  { value: 'PG', label: 'Structured storage', note: 'PostgreSQL keeps inbox intelligence queryable' },
];

const Login = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await loginWithGoogle();
      navigate(result?.user?.hasGmailAccess ? '/dashboard' : '/auth/gmail-connect');
    } catch (err) {
      console.error('Google login error:', err);
      setError(err.message || 'Failed to sign in with Google. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell auth-shell-wide">
      <section className="auth-hero auth-hero-premium">
        <div className="hero-glow hero-glow-left"></div>
        <div className="hero-glow hero-glow-right"></div>
        <div className="auth-hero-copy">
          <span className="eyebrow">EmailFlow AI</span>
          <h1>Inbox calm. Operator speed. Clean two-step setup.</h1>
          <p>
            Sign in with Google first, then finish one dedicated Gmail connection step so EmailFlow can sync, classify,
            summarize, and draft replies with stable backend-managed tokens.
          </p>
        </div>

        <div className="auth-stage-strip">
          {launchSteps.map((step, index) => (
            <article key={step.label} className="auth-stage-card">
              <span className="stage-index">0{index + 1}</span>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>

        <div className="hero-score-grid">
          {proofPoints.map((point) => (
            <article key={point.label} className="hero-score-card">
              <strong>{point.value}</strong>
              <span>{point.label}</span>
              <p>{point.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="auth-card auth-card-spotlight">
        <div className="auth-card-header">
          <span className="brand-mark">EF</span>
          <div>
            <h2>Sign in to EmailFlow AI</h2>
            <p>Google sign-in secures your workspace first. Gmail inbox access is connected right after.</p>
          </div>
        </div>

        {error && <div className="inline-alert error-alert">{error}</div>}

        <div className="connection-status-card">
          <span className="eyebrow">Built for daily use</span>
          <h3>Designed like a real inbox operating system.</h3>
          <p>Everything after login is organized around action, not just reading. That means cleaner lanes, less noise, and faster decisions.</p>
        </div>

        <div className="feature-stack feature-stack-tight">
          <div className="feature-row">
            <strong>Clean auth split</strong>
            <span>Firebase handles sign-in, then backend OAuth handles Gmail with the correct callback route.</span>
          </div>
          <div className="feature-row">
            <strong>Smart categories</strong>
            <span>Finance, developer, meetings, social, and newsletters</span>
          </div>
          <div className="feature-row">
            <strong>AI copilots</strong>
            <span>Summaries, classifications, and polished reply drafts</span>
          </div>
          <div className="feature-row">
            <strong>Production stack</strong>
            <span>Firebase auth, Gmail OAuth, PostgreSQL, and persistent sync</span>
          </div>
        </div>

        <button className="button button-primary button-full" onClick={handleGoogleLogin} disabled={loading}>
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <p className="auth-footnote">
          After sign-in, we will take you to the Gmail connection step so inbox access is stored correctly on the backend.
        </p>
      </section>
    </div>
  );

  /*
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">📧</div>
          <h1>Email Classifier</h1>
          <p>Smart email management with AI</p>
        </div>

        {error && (
          <div className="error-message" style={{ color: 'red', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#fee', borderRadius: '4px' }}>
            {error}
          </div>
        )}

        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">🤖</span>
            <div>
              <h3>AI Summarization</h3>
              <p>Get concise summaries of long emails</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <div>
              <h3>Smart Classification</h3>
              <p>Auto-categorize by priority and type</p>
            </div>
          </div>
          <div className="feature-item">
            <span className="feature-icon">✍️</span>
            <div>
              <h3>Reply Generation</h3>
              <p>AI-powered email replies</p>
            </div>
          </div>
        </div>

        <button
          className="google-login-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            'Signing in...'
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </>
          )}
        </button>
      </div>
    </div>
  );
  */
};

export default Login;
