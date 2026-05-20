import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
      <div className="navbar-inner">
        <a href="#" className="nav-logo">
          <div className="nav-logo-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 5l7-3 7 3v8l-7 3-7-3V5z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M9 2v14M2 5l7 3 7-3" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          EmailFlow AI
        </a>
        <ul className="nav-links">
          {['Overview','AI Inbox','Automation','Analytics','Integrations','Pricing'].map(l => (
            <li key={l}><a href={`#${l.toLowerCase().replace(' ','-')}`}>{l}</a></li>
          ))}
        </ul>
        <div className="nav-cta">
          <Link to="/dashboard" className="btn-ghost" style={{padding:'9px 20px',fontSize:'14px'}}>Sign in</Link>
          <Link to="/dashboard" className="btn-primary" id="nav-start-free" style={{padding:'9px 20px',fontSize:'14px'}}>Start Free</Link>
        </div>
      </div>
    </nav>
  );
}
