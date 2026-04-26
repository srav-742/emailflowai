import { useState, useEffect } from 'react';
import { digestAPI } from '../services/api';

const MorningBriefCard = () => {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDigest = async () => {
      try {
        setLoading(true);
        const response = await digestAPI.getToday();
        setDigest(response.data);
      } catch (error) {
        console.error('Failed to fetch today\'s brief:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchDigest();
  }, []);

  if (loading) return null;
  if (!digest || !digest.content || !digest.content.ai) return null;

  const { ai } = digest.content;

  return (
    <div 
      className="surface-card" 
      style={{ 
        padding: '2rem', 
        marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(110, 107, 255, 0.1) 0%, rgba(130, 200, 255, 0.1) 100%)',
        border: '1px solid rgba(110, 107, 255, 0.2)',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Decorative gradient blur */}
      <div style={{
        position: 'absolute',
        top: '-50px',
        right: '-50px',
        width: '150px',
        height: '150px',
        background: 'var(--accent-glow)',
        filter: 'blur(60px)',
        opacity: 0.3,
        zIndex: 0
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>☀️</span>
          <span className="eyebrow" style={{ color: 'var(--accent-light)' }}>Your Morning Brief</span>
        </div>

        <h2 style={{ fontSize: '1.75rem', margin: '0 0 1rem 0', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {ai.brief}
        </h2>

        <div className="bento-grid" style={{ gap: '1.5rem', marginTop: '2rem' }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
              🎯 Top Priority
            </span>
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
              {ai.topPriority}
            </p>
          </div>

          <div style={{ flex: 1 }}>
             <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
              📩 Inbox Status
            </span>
            <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-dim)' }}>
              {ai.emailSummary}
            </p>
          </div>

          <div style={{ flex: 1 }}>
             <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
              ✅ Tasks
            </span>
            <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-dim)' }}>
              {ai.actionSummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MorningBriefCard;
