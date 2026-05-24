import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import './SignIn.css';

/* ═══════════════════════════════════════════════════════════════
   PREMIUM AUTHENTICATION ENGINE — Unified OTP-Identity Flow
   Features:
     - Beautiful Dark Glassmorphic Theme
     - Sign In, Create Account & Forgot Password multi-flows
     - 6-box high-fidelity OTP Auto-Focus / Paste UX
     - Resend Cooldown Countdown 
     - Seamless DB refresh session persistence
 ═══════════════════════════════════════════════════════════════ */

const STEPS = [
  { id: 1, label: 'Account' },
  { id: 2, label: 'Verify' },
];

const OTP_LENGTH = 6;

const SignIn = () => {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();

  // Authentication Mode States
  const [step, setStep] = useState(1);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // Field states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP states
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [otpTimer, setOtpTimer] = useState(0);
  const otpRefs = useRef([]);

  // Dev assistant fallback OTP (highly secure, only displayed locally)
  const [devOtp, setDevOtp] = useState(null);

  // UX Feedback Messages
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [infoMsg, setInfoMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // OTP Countdown timer trigger
  useEffect(() => {
    if (otpTimer <= 0) return;
    const intervalId = setInterval(() => setOtpTimer((t) => t - 1), 1000);
    return () => clearInterval(intervalId);
  }, [otpTimer]);

  // ══════════════════════════════════════════════════════════
  // STEP 1 — Unified SMTP OTP request (signup/login/reset)
  // ══════════════════════════════════════════════════════════
  const handleStep1Submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfoMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setError('Please enter your email address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return setError('Please enter a valid email address.');
    }

    if (isSignUp) {
      if (!name.trim()) return setError('Please enter your name.');
      if (password.length < 6) return setError('Password must be at least 6 characters.');
    } else if (!isForgotPassword) {
      if (!password) return setError('Please enter your password.');
    }

    const type = isForgotPassword ? 'reset' : isSignUp ? 'signup' : 'login';

    setLoading(true);
    try {
      const res = await authAPI.registerAndSendOtp({ 
        name: isSignUp ? name : '', 
        email: trimmedEmail, 
        password: isForgotPassword ? '' : password, 
        type 
      });

      if (res.data?.message) setInfoMsg(res.data.message);
      if (res.data?.devOtp) setDevOtp(res.data.devOtp);

      setOtpTimer(60);
      setStep(2);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ══════════════════════════════════════════════════════════
  // STEP 2 — 6-box OTP entry Auto-Tabbing & Clipboard Paste
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
    if (code.length !== OTP_LENGTH) return setError('Please enter the full 6-digit verification code.');

    setLoading(true);
    try {
      const res = await authAPI.verifyOtp({ email, otp: code });
      const { token, refreshToken, user } = res.data;

      // Store Access and Database Rotated Refresh Session Tokens
      localStorage.setItem('token', token);
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }

      setSuccessMsg('Verification successful! Securing session…');

      setTimeout(() => {
        setSuccessMsg(null);
        window.location.href = '/dashboard';
      }, 1200);
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Incorrect verification code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError(null);
    setInfoMsg(null);
    try {
      const type = isForgotPassword ? 'reset' : isSignUp ? 'signup' : 'login';
      const res = await authAPI.resendOtp({ email, type });
      setOtpTimer(60);
      setInfoMsg('A fresh verification code has been sent to your inbox.');
      if (res.data?.devOtp) setDevOtp(res.data.devOtp);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to resend verification code.');
    }
  };

  // Switch Auth modes
  const handleToggleMode = (mode) => {
    setError(null);
    setInfoMsg(null);
    if (mode === 'signup') {
      setIsSignUp(true);
      setIsForgotPassword(false);
    } else if (mode === 'forgot') {
      setIsSignUp(false);
      setIsForgotPassword(true);
    } else {
      setIsSignUp(false);
      setIsForgotPassword(false);
    }
  };

  return (
    <div className="signin-page">
      {/* ── Ambient Background Glows ── */}
      <div className="bg-glow bg-glow-violet" />
      <div className="bg-glow bg-glow-cyan" />

      {/* ── Left Hero Panel (Visual Premium Display) ── */}
      <section className="signin-hero">
        <div className="signin-hero-content">
          <span className="signin-hero-badge">✦ EmailFlow AI Identity</span>
          <h1>Your inbox,<br />reimagined.</h1>
          <p className="signin-hero-desc">
            Vibrant, fast, and secure. EmailFlow AI employs cryptographically secure
            multi-session authentication coupled with premium asynchronous mail deliveries.
          </p>
        </div>

        <div className="signin-features">
          <div className="signin-feature">
            <div className="signin-feature-icon violet">🔑</div>
            <div className="signin-feature-text">
              <strong>Secure SMTP OTP Verification</strong>
              <span>Immediate, cryptographically generated secure verification pipelines</span>
            </div>
          </div>
          <div className="signin-feature">
            <div className="signin-feature-icon cyan">🛡️</div>
            <div className="signin-feature-text">
              <strong>Abuse Prevention Rate Limiters</strong>
              <span>Protected against spamming, enumeration, and brute-force sessions</span>
            </div>
          </div>
          <div className="signin-feature">
            <div className="signin-feature-icon green">💫</div>
            <div className="signin-feature-text">
              <strong>Rotated Refresh Sessions</strong>
              <span>DB-backed rotating session tokens, ensuring enterprise-grade compliance</span>
            </div>
          </div>
          <div className="signin-feature">
            <div className="signin-feature-icon blue">⚡</div>
            <div className="signin-feature-text">
              <strong>Asynchronous Worker Delivery</strong>
              <span>Powered by BullMQ queue pipelines for instantaneous mail deliveries</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Right Auth Glassmorphic Form Card Panel ── */}
      <section className="signin-form-panel">
        <div className="signin-card">
          
          {/* Card Header */}
          <div className="signin-card-header">
            <div className="signin-brand-mark">EF</div>
            <div>
              <h2>
                {step === 1 && (isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back')}
                {step === 2 && 'Verify Identity'}
              </h2>
              <p>
                {step === 1 && (isForgotPassword ? 'Enter your email to receive a reset code' : isSignUp ? 'Start your journey with EmailFlow AI' : 'Sign in to access your dashboard')}
                {step === 2 && `We sent a secure code to ${email}`}
              </p>
            </div>
          </div>

          {/* Progress Visual Tracker */}
          <div className="signin-progress">
            {STEPS.map((s, i) => (
              <div key={s.id} style={{ display: 'contents' }}>
                <div
                  className={`signin-progress-step ${
                    step === s.id ? 'active' : step > s.id ? 'complete' : ''
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

          {/* Alert messages */}
          {error && <div className="signin-error">{error}</div>}
          {infoMsg && <div className="signin-info">💡 {infoMsg}</div>}
          {successMsg && <div className="signin-success-msg">✅ {successMsg}</div>}

          {/* ─── STEP 1: Auth inputs ─── */}
          {step === 1 && (
            <form className="signin-step" onSubmit={handleStep1Submit}>
              <div className="signin-form-content">
                
                {isSignUp && (
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
                      required
                      autoComplete="name"
                    />
                  </div>
                )}

                <div className="signin-field">
                  <label htmlFor="signin-email">Email Address</label>
                  <input
                    id="signin-email"
                    className="signin-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                {!isForgotPassword && (
                  <div className="signin-field">
                    <label htmlFor="signin-password">Password</label>
                    <div className="signin-input-wrap">
                      <input
                        id="signin-password"
                        className="signin-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={isSignUp ? 'At least 6 characters' : 'Enter your password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
                )}

                {!isSignUp && !isForgotPassword && (
                  <div className="signin-forgot-link">
                    <a href="#" onClick={(e) => { e.preventDefault(); handleToggleMode('forgot'); }}>
                      Forgot Password?
                    </a>
                  </div>
                )}

                <button type="submit" className="signin-submit" disabled={loading}>
                  {loading && <span className="signin-spinner" />}
                  {loading ? 'Processing…' : isForgotPassword ? 'Send Verification Code' : isSignUp ? 'Sign Up' : 'Continue'}
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
                  {isForgotPassword ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); handleToggleMode('login'); }}>
                      Back to Sign In
                    </a>
                  ) : isSignUp ? (
                    <>
                      Already have an account?{' '}
                      <a href="#" onClick={(e) => { e.preventDefault(); handleToggleMode('login'); }}>
                        Sign in
                      </a>
                    </>
                  ) : (
                    <>
                      Don't have an account?{' '}
                      <a href="#" onClick={(e) => { e.preventDefault(); handleToggleMode('signup'); }}>
                        Create one
                      </a>
                    </>
                  )}
                </p>
              </div>
            </form>
          )}

          {/* ─── STEP 2: Secure OTP entry ─── */}
          {step === 2 && (
            <div className="signin-step">
              <div className="signin-form-content">
                <p className="signin-step-title">Enter Verification Code</p>
                <p className="signin-step-desc">
                  Input the 6-digit code sent to <strong style={{ color: 'var(--accent-light)' }}>{email}</strong>
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
                  {loading ? 'Verifying…' : 'Verify & Continue'}
                </button>

                <div className="signin-otp-resend">
                  {otpTimer > 0 ? (
                    <span className="signin-otp-timer">Resend available in {otpTimer}s</span>
                  ) : (
                    <button onClick={handleResendOtp}>Resend verification code</button>
                  )}
                </div>

                <p className="signin-footnote" style={{ marginTop: '1.5rem' }}>
                  Entered wrong details?{' '}
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
