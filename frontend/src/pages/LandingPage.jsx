import './LandingPage.css';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Landing/Navbar';
import HeroDashboard from '../components/Landing/HeroDashboard';
import ParticleField from '../components/Landing/ParticleField';

/* ── REVEAL HOOK ── */
function useReveal(delay = 0) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setTimeout(() => el.classList.add('visible'), delay); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);
  return ref;
}

/* ── TYPING ANIMATION ── */
function TypingText({ text, speed = 35 }) {
  const [displayed, setDisplayed] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let i = 0;
        const iv = setInterval(() => {
          setDisplayed(text.slice(0, i++));
          if (i > text.length) clearInterval(iv);
        }, speed);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [text, speed]);
  return <span ref={ref}>{displayed}<span className="typing-cursor" /></span>;
}

/* ── ANIMATED COUNTER ── */
function Counter({ target, suffix = '' }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const duration = 1800;
        const step = target / (duration / 16);
        const iv = setInterval(() => {
          start += step;
          if (start >= target) { setVal(target); clearInterval(iv); }
          else setVal(Math.floor(start));
        }, 16);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

/* ── SVG CHART ── */
function SparkChart({ color = '#4D9FFF', points }) {
  const pts = points || [20, 45, 30, 60, 40, 75, 55, 65, 80, 70, 90, 85];
  const w = 200, h = 80;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const min = Math.min(...pts), max = Math.max(...pts);
  const ys = pts.map(p => h - ((p - min) / (max - min)) * (h - 10) - 5);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const fill = `${d} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="svg-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#grad-${color.replace('#','')})`} />
      <path d={d} className="chart-path" stroke={color} strokeDasharray="300" strokeDashoffset="300"
        style={{ animation: 'draw-line 2s ease-out 0.5s both' }} />
    </svg>
  );
}

/* ── WORKFLOW NODE ── */
function WorkflowNode({ icon, label, sub, colorClass, active, delay = 0 }) {
  return (
    <div className={`workflow-node${active ? ' active' : ''}`}
      style={{ animationDelay: `${delay}s`, animation: 'slide-in-right 0.6s ease both' }}>
      <div className={`workflow-node-icon ${colorClass}`}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
      </div>
      {active && <div className="pulse-dot" style={{ marginLeft: 'auto' }} />}
    </div>
  );
}

/* ══════════════════════════════════════════════
   SECTIONS
   ══════════════════════════════════════════════ */

function Hero() {
  const h = useReveal(0), s = useReveal(100), c = useReveal(200);
  return (
    <section className="hero" id="overview">
      <div className="radial-glow radial-glow-blue" style={{ width: 700, height: 700, top: '10%', left: '50%', transform: 'translateX(-50%)' }} />
      <div className="radial-glow radial-glow-violet" style={{ width: 500, height: 500, top: '30%', right: '-10%' }} />

      <div className="hero-content">
        <div className="badge">✦ AI-Powered Communication</div>
        <h1 className="hero-headline reveal" ref={h}>The Future of<br />Email Intelligence</h1>
        <p className="hero-sub reveal reveal-delay-1" ref={s}>
          An AI-powered communication assistant that organizes, prioritizes, summarizes, and drafts your workflow — automatically.
        </p>
        <div className="hero-ctas reveal reveal-delay-2" ref={c}>
          <Link to="/dashboard" className="btn-primary" id="hero-start-cta">
            Start Using EmailFlow AI
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <a href="#automation" className="btn-ghost" id="hero-demo-cta">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" /><path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor" /></svg>
            Watch Demo
          </a>
        </div>
      </div>

      <div className="hero-dashboard-wrap reveal" ref={useReveal(300)}>
        <HeroDashboard />
      </div>

      <div className="hero-scroll-hint">
        <span>Scroll to explore</span>
        <div className="scroll-arrow" />
      </div>
    </section>
  );
}

function LogosSection() {
  const logos = ['Notion', 'Slack', 'Linear', 'Figma', 'Vercel', 'GitHub', 'Stripe'];
  return (
    <div className="logos-section">
      <div className="logos-label">Trusted by teams at world-class companies</div>
      <div className="logos-strip">
        {logos.map(l => <div key={l} className="logo-item">{l}</div>)}
      </div>
    </div>
  );
}

function InboxSection() {
  const t = useReveal(0), d = useReveal(200);
  return (
    <section className="feature-section" id="ai-inbox">
      <div className="radial-glow radial-glow-blue" style={{ width: 600, height: 600, top: '20%', left: '-10%' }} />
      <div className="feature-grid container">
        <div className="feature-text">
          <div className="badge">✦ AI Inbox</div>
          <h2 className="feature-headline reveal" ref={t}>Inbox intelligence,<br />automated.</h2>
          <p className="feature-desc reveal reveal-delay-1" ref={d}>
            EmailFlow AI reads, understands, and organizes every message before you open it. Priority scoring, smart labels, and instant AI summaries — applied at inbox speed.
          </p>
          <ul className="feature-list">
            <li>Auto-priority scoring on every email</li>
            <li>AI-generated summaries in seconds</li>
            <li>Smart label and folder routing</li>
            <li>Duplicate & noise filtering</li>
          </ul>
        </div>
        <div className="feature-visual">
          <div className="f-panel">
            <div className="f-panel-header">
              <div className="f-panel-icon f-panel-icon-blue">📬</div>
              <div><div className="f-panel-title">Smart Inbox</div><div className="f-panel-sub">24 emails · 6 priority</div></div>
              <div className="ai-status" style={{ marginLeft: 'auto' }}><div className="ai-status-dot" />Live</div>
            </div>
            {[
              { from: 'Investor Relations', subject: 'Term Sheet — Series A Docs', priority: 'Critical', color: '#FF6B6B' },
              { from: 'Engineering Team', subject: 'Deploy approved — v2.4.1', priority: 'Action', color: '#4D9FFF' },
              { from: 'Google Workspace', subject: 'Your weekly activity report', priority: 'Low', color: '#555' },
            ].map((e, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{e.from}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, border: `1px solid ${e.color}44`, color: e.color, background: `${e.color}11` }}>{e.priority}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.subject}</div>
              </div>
            ))}
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(77,159,255,0.05)', border: '1px solid rgba(77,159,255,0.12)', borderRadius: 12 }}>
              <div className="ai-label">✦ AI Insight</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>You have 1 critical investor email requiring response within 24h.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReplySection() {
  const t = useReveal(0);
  const replyText = "Thank you for sending over the term sheet. I've reviewed the key clauses and I'm aligned on the valuation. Let's schedule a call this week to finalize the remaining details.";
  return (
    <section className="feature-section" id="automation" style={{ background: 'linear-gradient(180deg, transparent, rgba(8,17,32,0.4), transparent)' }}>
      <div className="radial-glow radial-glow-violet" style={{ width: 600, height: 600, top: '10%', right: '-5%' }} />
      <div className="feature-grid container reverse">
        <div className="feature-visual">
          <div className="f-panel" style={{ animationDelay: '1s' }}>
            <div className="f-panel-header">
              <div className="f-panel-icon f-panel-icon-violet">✍️</div>
              <div><div className="f-panel-title">AI Reply Generation</div><div className="f-panel-sub">Composing smart response…</div></div>
            </div>
            <div className="typing-block">
              <div className="typing-label">AI is writing</div>
              <div className="typing-text"><TypingText text={replyText} speed={28} /></div>
            </div>
            <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Suggested Alternatives</div>
            {['Keep it brief and professional →', 'Request more time to review →', 'Escalate to legal team →'].map((s, i) => (
              <div key={i} className="reply-suggestion" style={{ animationDelay: `${i * 0.15}s` }}>{s}</div>
            ))}
          </div>
        </div>
        <div className="feature-text">
          <div className="badge">✦ Smart Replies</div>
          <h2 className="feature-headline reveal" ref={t}>Replies generated<br />before you think.</h2>
          <p className="feature-desc">
            EmailFlow AI reads context, understands intent, and drafts on-brand replies in your voice. Choose, edit, or send — all in seconds.
          </p>
          <ul className="feature-list">
            <li>Contextual AI drafting from email thread</li>
            <li>Tone matching to your writing style</li>
            <li>Multiple suggestion variations</li>
            <li>One-click send or manual editing</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function AutomationSection() {
  const t = useReveal(0);
  return (
    <section className="feature-section">
      <div className="radial-glow radial-glow-cyan" style={{ width: 500, height: 500, top: '30%', left: '10%' }} />
      <div className="feature-grid container">
        <div className="feature-text">
          <div className="badge">✦ Automation</div>
          <h2 className="feature-headline reveal" ref={t}>Automation that<br />works silently.</h2>
          <p className="feature-desc">
            Build intelligent pipelines once. EmailFlow AI handles follow-ups, task extraction, escalations, and scheduling — running quietly in the background.
          </p>
          <ul className="feature-list">
            <li>Smart follow-up scheduling</li>
            <li>Action item extraction & routing</li>
            <li>AI escalation triggers</li>
            <li>Calendar & task app sync</li>
          </ul>
        </div>
        <div className="feature-visual">
          <div className="f-panel">
            <div className="f-panel-header">
              <div className="f-panel-icon f-panel-icon-cyan">⚡</div>
              <div><div className="f-panel-title">Workflow Pipeline</div><div className="f-panel-sub">4 automations running</div></div>
            </div>
            <WorkflowNode icon="📥" label="Email Received" sub="Investor: Term Sheet" colorClass="wn-blue" active delay={0} />
            <div className="workflow-connector" />
            <WorkflowNode icon="🧠" label="AI Classification" sub="Priority: Critical · Category: Finance" colorClass="wn-violet" active delay={0.1} />
            <div className="workflow-connector" />
            <WorkflowNode icon="📝" label="Action Items Extracted" sub="3 tasks created in Linear" colorClass="wn-cyan" active delay={0.2} />
            <div className="workflow-connector" />
            <WorkflowNode icon="📅" label="Follow-up Scheduled" sub="Reminder set: Friday 10:00 AM" colorClass="wn-green" delay={0.3} />
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsSection() {
  const t = useReveal(0);
  return (
    <section className="feature-section" id="analytics" style={{ background: 'linear-gradient(180deg, transparent, rgba(8,17,32,0.5), transparent)' }}>
      <div className="radial-glow radial-glow-blue" style={{ width: 700, height: 500, top: '10%', right: '-5%' }} />
      <div className="feature-grid container reverse">
        <div className="feature-visual">
          <div className="f-panel">
            <div className="f-panel-header">
              <div className="f-panel-icon f-panel-icon-blue">📊</div>
              <div><div className="f-panel-title">Productivity Analytics</div><div className="f-panel-sub">This month vs last month</div></div>
            </div>
            <div className="analytics-row">
              {[
                { label: 'Hours Saved', target: 47, suffix: 'h' },
                { label: 'Emails Processed', target: 1284, suffix: '' },
                { label: 'AI Actions', target: 312, suffix: '' },
              ].map(s => (
                <div key={s.label} className="analytics-card">
                  <div className="analytics-value"><Counter target={s.target} suffix={s.suffix} /></div>
                  <div className="analytics-label">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="chart-area">
              <SparkChart color="#4D9FFF" points={[30, 45, 35, 60, 50, 70, 65, 80, 72, 88, 82, 95]} />
            </div>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Response Rate', val: '94%', up: true },
                { label: 'Avg. Reply Time', val: '4.2min', up: false },
              ].map(m => (
                <div key={m.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: m.up ? '#4ADE80' : '#FF6B6B', marginTop: 4 }}>{m.up ? '↑ +12%' : '↓ -38%'} vs last month</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="feature-text">
          <div className="badge">✦ Analytics</div>
          <h2 className="feature-headline reveal" ref={t}>Productivity,<br />visualized intelligently.</h2>
          <p className="feature-desc">
            Real-time dashboards show you exactly where time is saved, what AI is automating, and how your communication patterns are improving every week.
          </p>
          <ul className="feature-list">
            <li>Live productivity scoring</li>
            <li>Email volume & response trends</li>
            <li>AI automation impact reports</li>
            <li>Team-wide communication insights</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function IntegrationsSection() {
  const t = useReveal(0);
  const integrations = [
    { icon: '📧', name: 'Gmail', bg: 'rgba(234,67,53,0.1)' },
    { icon: '📮', name: 'Outlook', bg: 'rgba(0,120,212,0.1)' },
    { icon: '💬', name: 'Slack', bg: 'rgba(74,21,75,0.2)' },
    { icon: '📋', name: 'Notion', bg: 'rgba(255,255,255,0.05)' },
    { icon: '📐', name: 'Linear', bg: 'rgba(95,92,228,0.1)' },
    { icon: '🗓️', name: 'Calendar', bg: 'rgba(52,168,83,0.1)' },
    { icon: '⚡', name: 'Zapier', bg: 'rgba(255,102,0,0.1)' },
    { icon: '🔗', name: 'Salesforce', bg: 'rgba(0,161,224,0.1)' },
  ];
  return (
    <section className="integrations-section" id="integrations">
      <div className="section-header">
        <div className="badge">✦ Integrations</div>
        <h2 className="section-title reveal" ref={t}>Connects to your<br />entire stack.</h2>
        <p className="section-desc">EmailFlow AI plugs into the tools you already use — no migration, no disruption, just intelligence layered on top.</p>
      </div>
      <div className="integrations-grid container">
        {integrations.map((ig, i) => (
          <div key={i} className="integration-card reveal" ref={useReveal(i * 60)} style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="integration-icon" style={{ background: ig.bg }}>{ig.icon}</div>
            <div className="integration-name">{ig.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingSection() {
  const t = useReveal(0);
  const plans = [
    {
      plan: 'Starter', price: '0', period: 'Free forever',
      features: ['500 AI email summaries/mo', '100 smart replies', 'Basic automation', 'Gmail & Outlook'],
    },
    {
      plan: 'Pro', price: '29', period: 'per month', featured: true,
      features: ['Unlimited AI summaries', 'Unlimited smart replies', 'Advanced automation flows', 'All integrations', 'Priority AI processing', 'Analytics dashboard'],
    },
    {
      plan: 'Enterprise', price: '99', period: 'per seat/month',
      features: ['Everything in Pro', 'Custom AI fine-tuning', 'Team analytics', 'Dedicated AI model', 'SSO & audit logs', 'SLA guarantee'],
    },
  ];
  return (
    <section className="pricing-section" id="pricing">
      <div className="radial-glow radial-glow-blue" style={{ width: 600, height: 400, top: '10%', left: '50%', transform: 'translateX(-50%)' }} />
      <div className="section-header">
        <div className="badge">✦ Pricing</div>
        <h2 className="section-title reveal" ref={t}>Simple, transparent pricing.</h2>
        <p className="section-desc">Start free. Scale as your team grows. No surprise fees.</p>
      </div>
      <div className="pricing-grid container">
        {plans.map((p, i) => (
          <div key={i} className={`pricing-card reveal reveal-delay-${i + 1}`} ref={useReveal(i * 100)}>
            {p.featured && <div className="pricing-featured-badge">Most Popular</div>}
            <div className="pricing-plan">{p.plan}</div>
            <div className="pricing-price"><span>$</span>{p.price}</div>
            <div className="pricing-period">{p.period}</div>
            <div className="pricing-divider" />
            <ul className="pricing-features">
              {p.features.map(f => <li key={f}>{f}</li>)}
            </ul>
            <Link to="/dashboard" className={p.featured ? 'btn-primary' : 'btn-ghost'} id={`pricing-${p.plan.toLowerCase()}`} style={{ width: '100%', justifyContent: 'center' }}>
              {p.plan === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="final-cta">
      <div className="final-cta-glow" />
      <div className="badge">✦ Get Started Today</div>
      <h2 className="final-headline" style={{ fontSize: 'clamp(36px,5vw,72px)', maxWidth: 700, margin: '0 auto 20px' }}>
        The future of communication starts here.
      </h2>
      <p className="final-sub">Work smarter with AI-powered email intelligence. Join 10,000+ professionals already saving hours every week.</p>
      <div className="final-ctas">
        <Link to="/dashboard" className="btn-primary" id="final-cta-start" style={{ fontSize: 16, padding: '16px 36px' }}>
          Start Free Today
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <Link to="/dashboard" className="btn-ghost" id="final-cta-demo" style={{ fontSize: 16, padding: '15px 35px' }}>Schedule a Demo</Link>
      </div>
      <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
        {['No credit card required', 'Setup in under 2 minutes', 'Cancel anytime'].map(t => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#4D9FFF" strokeWidth="1.2"/><path d="M4 7l2 2 4-4" stroke="#4D9FFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {t}
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: 'Product', links: ['Overview', 'AI Inbox', 'Smart Replies', 'Automation', 'Analytics'] },
    { title: 'Integrations', links: ['Gmail', 'Outlook', 'Slack', 'Notion', 'Linear'] },
    { title: 'Company', links: ['About', 'Blog', 'Careers', 'Press', 'Contact'] },
    { title: 'Legal', links: ['Privacy', 'Terms', 'Security', 'Cookies'] },
  ];
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div>
            <div className="footer-brand-name">EmailFlow AI</div>
            <div className="footer-brand-desc">The intelligent communication layer for modern teams and professionals.</div>
          </div>
          <div className="footer-links-grid">
            {cols.map(col => (
              <div key={col.title}>
                <div className="footer-col-title">{col.title}</div>
                <ul className="footer-col-links">
                  {col.links.map(l => <li key={l}><a href="#">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-copy">© 2025 EmailFlow AI. All rights reserved.</div>
          <div className="footer-legal">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ══════════════════════════════════════════════
   APP ROOT
   ══════════════════════════════════════════════ */
export default function EmailFlowLandingPage() {
  return (
    <div className="landing-page-root">
      <ParticleField />
      <div className="bg-grid" />
      <Navbar />
      <main style={{ position: 'relative', zIndex: 1 }}>
        <Hero />
        <LogosSection />
        <InboxSection />
        <ReplySection />
        <AutomationSection />
        <AnalyticsSection />
        <IntegrationsSection />
        <PricingSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}