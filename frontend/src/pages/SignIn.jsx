import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  auth,
  googleProvider,
  GoogleAuthProvider,
  signInWithPopup,
} from '../config/firebase';
import { authAPI } from '../services/api';
import './SignIn.css';

/* ═══════════════════════════════════════════════════════════════
   SIGN-IN PAGE — Multi-Step Auth Flow
   Step 1: Name / Email / Password
   Step 2: OTP verification (email)
   Step 3: Connect Gmail
   → Dashboard
═══════════════════════════════════════════════════════════════ */

const STEPS = [
  { id: 1, label: 'Account' },
  { id: 2, label: 'Verify' },
];

const OTP_LENGTH = 6;

const SignIn = () => {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();

  // Step management
  const [step, setStep] = useState(1);

  // Step 1 fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Step 2 – OTP
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [otpTimer, setOtpTimer] = useState(0);
  const otpRefs = useRef([]);

  // Step 3 – Gmail connect (Removed as per user request to drop OAuth)

  // Developer Assist State
  const [devOtp, setDevOtp] = useState(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // ── OTP countdown timer ──
  useEffect(() => {
    if (otpTimer <= 0) return;
    const id = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [otpTimer]);

  // ══════════════════════════════════════════════════════════
  // STEP 1 — Create account & send OTP
  // ══════════════════════════════════════════════════════════
  const handleStep1Submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    if (!name.trim()) return setError('Please enter your name.');
    if (!email.trim()) return setError('Please enter your email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError('Please enter a valid email address.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');

    setLoading(true);
    try {
      // Register / login via backend → sends OTP email
      const res = await authAPI.registerAndSendOtp({ name, email, password });
      if (res.data?.message) setInfoMsg(res.data.message);
      if (res.data?.devOtp) setDevOtp(res.data.devOtp);

      setOtpTimer(60);
      setStep(2);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════
  // STEP 2 — Verify OTP
  // ══════════════════════════════════════════════════════════
  const handleOtpChange = useCallback(
    (idx, value) => {
      if (!/^\d?$/.test(value)) return;
      setOtp((prev) => {
        const next = [...prev];
        next[idx] = value;
        return next;
      });
      // Auto-focus next box
      if (value && idx < OTP_LENGTH - 1) {
        otpRefs.current[idx + 1]?.focus();
      }
    },
    []
  );

  const handleOtpKeyDown = useCallback((idx, e) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  }, [otp]);

  const handleOtpPaste = useCallback((e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pastedData) return;
    const newOtp = Array(OTP_LENGTH).fill('');
    pastedData.split('').forEach((ch, i) => { newOtp[i] = ch; });
    setOtp(newOtp);
    const focusIdx = Math.min(pastedData.length, OTP_LENGTH - 1);
    otpRefs.current[focusIdx]?.focus();
  }, []);

  const handleVerifyOtp = async () => {
    setError(null);
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) return setError('Please enter the full 6-digit code.');

    setLoading(true);
    try {
      const res = await authAPI.verifyOtp({ email, otp: code });
      const { token, user } = res.data;

      // Store token → auth context will pick it up
      localStorage.setItem('token', token);
      setSuccessMsg('Email verified successfully! Redirecting to dashboard…');

      // Brief pause so the user sees the success message, then redirect directly to dashboard
      setTimeout(() => {
        setSuccessMsg(null);
        window.location.href = '/dashboard';
      }, 1200);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Invalid OTP.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    try {
      const res = await authAPI.resendOtp({ email });
      setOtpTimer(60);
      setInfoMsg('A new OTP has been sent to your email.');
      if (res.data?.devOtp) setDevOtp(res.data.devOtp);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to resend OTP.');
    }
  };

  // ══════════════════════════════════════════════════════════
  // STEP 3 — Connect Gmail & go to Dashboard
  // ══════════════════════════════════════════════════════════
  const handleConnectGmail = async () => {
    setError(null);
    setGmailConnecting(true);
    try {
      // Use the existing Firebase Google sign-in flow which triggers Gmail OAuth
      await loginWithGoogle();
      setSuccessMsg('Gmail connected! Redirecting to dashboard…');
      setTimeout(() => navigate('/dashboard'), 1000);
    } catch (err) {
      setError(err.message || 'Failed to connect Gmail. You can try again from Settings.');
      setGmailConnecting(false);
    }
  };

  const handleSkipGmail = () => {
    // Force reload to let AuthContext pick up the new token from localStorage
    window.location.href = '/dashboard';
  };

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div className="signin-page">
      {/* ── Left hero panel ── */}
      <section className="signin-hero">
        <div>
          <span className="signin-hero-badge">✦ EmailFlow AI</span>
          <h1>Your inbox,<br />reimagined.</h1>
          <p className="signin-hero-desc">
            AI-powered email intelligence that organizes, prioritizes, summarizes,
            and drafts your entire communication workflow — automatically.
          </p>
        </div>

        <div className="signin-features">
          <div className="signin-feature">
            <div className="signin-feature-icon violet">🧠</div>
            <div className="signin-feature-text">
              <strong>AI Summaries & Classification</strong>
              <span>Every email analyzed, prioritized, and labeled instantly</span>
            </div>
          </div>
          <div className="signin-feature">
            <div className="signin-feature-icon cyan">✍️</div>
            <div className="signin-feature-text">
              <strong>Smart Reply Generation</strong>
              <span>Context-aware drafts in your tone, ready in seconds</span>
            </div>
          </div>
          <div className="signin-feature">
            <div className="signin-feature-icon green">📊</div>
            <div className="signin-feature-text">
              <strong>Focused Lanes</strong>
              <span>Finance, developer, meetings, newsletters — auto-sorted</span>
            </div>
          </div>
          <div className="signin-feature">
            <div className="signin-feature-icon blue">🔐</div>
            <div className="signin-feature-text">
              <strong>Secure Gmail Integration</strong>
              <span>OAuth 2.0 with encrypted token storage on the backend</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Right form panel ── */}
      <section className="signin-form-panel">
        <div className="signin-card">
          {/* Card Header */}
          <div className="signin-card-header">
            <div className="signin-brand-mark">EF</div>
            <div>
              <h2>
                {step === 1 && 'Create your account'}
                {step === 2 && 'Verify your email'}
              </h2>
              <p>
                {step === 1 && 'Start your journey with EmailFlow AI'}
                {step === 2 && `We sent a 6-digit code to ${email}`}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="signin-progress">
            {STEPS.map((s, i) => (
              <div key={s.id} style={{ display: 'contents' }}>
                <div
                  className={`signin-progress-step ${step === s.id ? 'active' : step > s.id ? 'complete' : ''
                    }`}
                >
                  <div className="signin-progress-dot">
                    {step > s.id ? '✓' : s.id}
                  </div>
                  <span className="signin-progress-label">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`signin-progress-line ${step > s.id ? 'filled' : ''}`} />
                )}
              </div>
            ))}
          </div>

          {/* Messages */}
          {error && <div className="signin-error">{error}</div>}
          {infoMsg && <div className="signin-info">💡 {infoMsg}</div>}
          {successMsg && <div className="signin-success-msg">✅ {successMsg}</div>}

          {/* ─── STEP 1: Account details ─── */}
          {step === 1 && (
            <form className="signin-step" onSubmit={handleStep1Submit}>
              <div className="signin-form-content">
                <p className="signin-step-title">Get Started</p>
                <p className="signin-step-desc">
                  Enter your details below. We'll send a verification code to your email.
                </p>

                <div className="signin-field">
                  <label htmlFor="signin-name">Full Name</label>
                  <input
                    id="signin-name"
                    className="signin-input"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    autoComplete="name"
                  />
                </div>

                <div className="signin-field">
                  <label htmlFor="signin-email">Email Address</label>
                  <input
                    id="signin-email"
                    className="signin-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="signin-field">
                  <label htmlFor="signin-password">Password</label>
                  <div className="signin-input-wrap">
                    <input
                      id="signin-password"
                      className="signin-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="signin-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <button type="submit" className="signin-submit" disabled={loading}>
                  {loading && <span className="signin-spinner" />}
                  {loading ? 'Creating account…' : 'Continue'}
                </button>

                <div className="signin-divider">or</div>

                <button
                  type="button"
                  className="signin-gmail-btn"
                  onClick={async () => {
                    setError(null);
                    setLoading(true);
                    try {
                      await loginWithGoogle();
                      navigate('/dashboard');
                    } catch (err) {
                      setError(err.message || 'Google sign-in failed.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                <p className="signin-footnote">
                  Already have an account?{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); /* sign-in is the same flow */ }}>
                    Sign in
                  </a>
                </p>
              </div>
            </form>
          )}

          {/* ─── STEP 2: OTP Verification ─── */}
          {step === 2 && (
            <div className="signin-step">
              <div className="signin-form-content">
                <p className="signin-step-title">Enter verification code</p>
                <p className="signin-step-desc">
                  Check your inbox at <strong style={{ color: 'var(--accent-light)' }}>{email}</strong> for the 6-digit code.
                </p>

                <div className="signin-otp-group" onPaste={handleOtpPaste}>
                  {otp.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpRefs.current[idx] = el)}
                      className={`signin-otp-box ${digit ? 'filled' : ''}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      autoFocus={idx === 0}
                    />
                  ))}
                </div>

                {devOtp && (
                  <div className="signin-dev-helper">
                    <span className="signin-dev-badge">🔧 Dev Helper</span>
                    <p>Since this is a local development build, here is your OTP code:</p>
                    <div className="signin-dev-code">{devOtp}</div>
                  </div>
                )}

                <button
                  className="signin-submit"
                  style={{ marginTop: '1.5rem' }}
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.join('').length !== OTP_LENGTH}
                >
                  {loading && <span className="signin-spinner" />}
                  {loading ? 'Verifying…' : 'Verify Email'}
                </button>

                <div className="signin-otp-resend">
                  {otpTimer > 0 ? (
                    <span className="signin-otp-timer">Resend code in {otpTimer}s</span>
                  ) : (
                    <button onClick={handleResendOtp}>Resend verification code</button>
                  )}
                </div>

                <p className="signin-footnote" style={{ marginTop: '1rem' }}>
                  Wrong email?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setStep(1);
                      setError(null);
                      setInfoMsg(null);
                      setOtp(Array(OTP_LENGTH).fill(''));
                    }}
                  >
                    Go back
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SignIn;
