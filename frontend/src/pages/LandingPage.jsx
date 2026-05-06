import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Shield, 
  Zap, 
  Brain, 
  Mail, 
  Calendar, 
  ArrowRight,
  Sparkles,
  Layers,
  Lock
} from 'lucide-react';

const FeatureCard = ({ icon: Icon, title, description, delay }) => (
  <div 
    className="surface-card" 
    style={{ 
      padding: '2rem', 
      borderRadius: '24px', 
      display: 'grid', 
      gap: '1rem',
      animation: `fade-in-up 0.6s ease-out ${delay}s both`
    }}
  >
    <div className="brand-mark" style={{ background: 'var(--panel-soft)', color: 'var(--accent-light)', boxShadow: 'none', border: '1px solid var(--border)' }}>
      <Icon size={24} />
    </div>
    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>
    <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>{description}</p>
  </div>
);

const LandingPage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const handleGetStarted = () => {
    if (token) {
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', overflowX: 'hidden' }}>
      {/* Navbar */}
      <nav style={{ 
        padding: '1.5rem 2rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)'
      }}>
        <div className="brand-lockup">
          <span className="brand-mark">EF</span>
          <h2 className="brand-title" style={{ fontSize: '1.25rem' }}>EmailFlow AI</h2>
        </div>
        <div className="header-actions">
          <button className="button button-ghost" onClick={() => navigate('/login')}>Sign In</button>
          <button className="button button-primary" onClick={handleGetStarted}>Get Started</button>
        </div>
      </nav>

      {/* Hero Section */}
      <header style={{ 
        padding: '10rem 2rem 6rem', 
        maxWidth: '1200px', 
        margin: '0 auto', 
        textAlign: 'center',
        position: 'relative'
      }}>
        <div className="hero-glow hero-glow-left" style={{ top: '10%', left: '20%' }}></div>
        <div className="hero-glow hero-glow-right" style={{ bottom: '10%', right: '20%' }}></div>
        
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="eyebrow" style={{ marginBottom: '1.5rem' }}>
            <Sparkles size={14} style={{ marginRight: '0.5rem' }} />
            The Future of Inbox Management
          </span>
          <h1 style={{ 
            fontSize: 'clamp(3.5rem, 8vw, 6.5rem)', 
            lineHeight: 0.9, 
            letterSpacing: '-0.04em', 
            fontWeight: 800,
            margin: '0 0 2rem',
            background: 'linear-gradient(135deg, #fff 40%, var(--accent-light) 70%, var(--cyan-light) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Operate your inbox <br /> at the speed of AI.
          </h1>
          <p style={{ 
            fontSize: '1.25rem', 
            color: 'var(--muted-strong)', 
            maxWidth: '60ch', 
            margin: '0 auto 3rem',
            lineHeight: 1.6
          }}>
            EmailFlow AI transforms your messy Gmail into a structured operating system. 
            Automated summaries, smart classification, and AI-drafted replies—all in one premium workspace.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="button button-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }} onClick={handleGetStarted}>
              Start for free <ArrowRight size={20} style={{ marginLeft: '0.5rem' }} />
            </button>
            <button className="button button-secondary" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}>
              View Demo
            </button>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <section style={{ padding: '6rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="section-heading" style={{ textAlign: 'center', marginBottom: '4rem', display: 'grid', placeItems: 'center' }}>
          <span className="eyebrow">Capabilities</span>
          <h2 style={{ fontSize: '3rem', marginTop: '1rem' }}>Designed for focus.</h2>
          <p style={{ maxWidth: '50ch' }}>Stop drowning in threads. Let AI sort the noise so you can focus on what matters.</p>
        </div>

        <div className="bento-grid">
          <div className="bento-col-4">
            <FeatureCard 
              icon={Brain}
              title="AI Summarization"
              description="Get instant, bulleted summaries of long email chains. Understand context in seconds."
              delay={0.1}
            />
          </div>
          <div className="bento-col-4">
            <FeatureCard 
              icon={Zap}
              title="Smart Lanes"
              description="Auto-categorize emails into Finance, Developer, Meetings, and Social queues."
              delay={0.2}
            />
          </div>
          <div className="bento-col-4">
            <FeatureCard 
              icon={Mail}
              title="AI Reply Drafts"
              description="Polished, context-aware reply drafts generated automatically for your review."
              delay={0.3}
            />
          </div>
          <div className="bento-col-6">
            <FeatureCard 
              icon={Calendar}
              title="Calendar Integration"
              description="Sync meetings and tasks directly to your Google Calendar without leaving the app."
              delay={0.4}
            />
          </div>
          <div className="bento-col-6">
            <FeatureCard 
              icon={Shield}
              title="Secure OAuth"
              description="Enterprise-grade security using official Google OAuth 2.0 protocols for all data access."
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section style={{ padding: '8rem 2rem', textAlign: 'center', borderTop: '1px solid var(--border)', background: 'var(--panel-soft)' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Lock size={48} style={{ color: 'var(--accent-light)', marginBottom: '2rem' }} />
          <h2 style={{ fontSize: '2.5rem', marginBottom: '1.5rem' }}>Your data stays yours.</h2>
          <p style={{ fontSize: '1.1rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: '3rem' }}>
            EmailFlow AI uses direct API connections to Gmail. We never store your emails permanently. 
            All intelligence is processed securely and ephemeral tokens are managed by your own Google identity.
          </p>
          <div style={{ display: 'flex', gap: '4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '1.5rem', color: '#fff' }}>256-bit</strong>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Encryption</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '1.5rem', color: '#fff' }}>OAuth 2.0</strong>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Official Auth</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '1.5rem', color: '#fff' }}>99.9%</strong>
              <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Uptime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '4rem 2rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <div className="brand-lockup" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
          <span className="brand-mark">EF</span>
          <h2 className="brand-title">EmailFlow AI</h2>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          &copy; 2024 EmailFlow AI. All rights reserved. Built for the modern operator.
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
};

export default LandingPage;
