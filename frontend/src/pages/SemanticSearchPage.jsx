import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Sparkles, Database, Loader, ArrowRight, Mail } from 'lucide-react';

const API_BASE = '/api/ai/semantic-search';

export default function SemanticSearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState(null);
  const [indexMessage, setIndexMessage] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');

  const suggestions = [
    "show emails about Q3 hiring from last month",
    "find invoices from Stripe or Amazon over $500",
    "emails where client sounded unhappy or urgent",
    "threads mentioning Kubernetes deployment issues",
    "what are my critical deadlines next week?"
  ];

  const handleSearch = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await axios.post(
        API_BASE,
        { query: q, limit: 5 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setResult({
        summary: '⚠️ Failed to connect to semantic search engine. Ensure your backend server is active and database is synchronized.',
        matches: []
      });
    } finally {
      setLoading(false);
    }
  };

  const handleIndexWorkspace = async () => {
    setIndexing(true);
    setIndexMessage('Indexing inbox communications in the background. Embedding vectors are generating...');
    try {
      const res = await axios.post(
        `${API_BASE}/index-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIndexMessage(`✅ ${res.data.message}`);
    } catch (err) {
      setIndexMessage('⚠️ Indexing failed. Ensure API endpoints are mounted and database is accessible.');
    } finally {
      setIndexing(false);
      setTimeout(() => setIndexMessage(''), 8000);
    }
  };

  return (
    <div className="analytics-container fade-in" style={{ padding: '1rem', color: 'var(--text)' }}>
      {/* Indexer Banner */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 1.5rem',
        borderRadius: '16px',
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={20} className="text-accent" style={{ color: 'var(--accent)' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Semantic Index Workspace</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.75 }}>Index your workspace emails to build search vector embeddings.</p>
          </div>
        </div>
        <button
          className="button button-ghost"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          onClick={handleIndexWorkspace}
          disabled={indexing}
        >
          {indexing ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {indexing ? 'Indexing...' : 'Index Workspace'}
        </button>
      </div>

      {indexMessage && (
        <div className="pulse-card" style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          {indexMessage}
        </div>
      )}

      {/* Main ChatGPT-style Search Area */}
      <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto 3rem auto' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>
          Natural-Language Recall
        </h2>
        <p style={{ opacity: 0.8, fontSize: '0.95rem', marginBottom: '2rem' }}>
          Ask questions across your entire communications history. AI traverses vector layers to synthesize briefings instantly.
        </p>

        {/* Input Lockup */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--panel-elevated)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '0.5rem 0.5rem 0.5rem 1.5rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          transition: 'border 0.3s ease',
          marginBottom: '1.5rem'
        }} className="search-input-container">
          <Search size={20} style={{ opacity: 0.5, marginRight: '0.75rem' }} />
          <input
            type="text"
            placeholder="e.g. Find invoices from Stripe or client agreements regarding Stage 3..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '1rem',
              padding: '0.5rem 0'
            }}
          />
          <button
            className="button button-primary"
            style={{
              borderRadius: '16px',
              padding: '0.6rem 1.2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, var(--highlight), var(--accent))'
            }}
            onClick={() => handleSearch()}
            disabled={loading}
          >
            {loading ? <Loader className="animate-spin" size={16} /> : <ArrowRight size={16} />}
            Ask AI
          </button>
        </div>

        {/* Suggestions chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem' }}>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              className="badge"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'var(--text)',
                padding: '0.4rem 0.8rem',
                borderRadius: '20px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                setQuery(s);
                handleSearch(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', margin: '4rem 0' }}>
          <Loader size={40} className="animate-spin text-accent" style={{ color: 'var(--accent)', margin: '0 auto 1rem auto' }} />
          <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>Searching vector index & synthesizing executive briefing...</p>
        </div>
      )}

      {/* Results Panel */}
      {result && (
        <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Executive Synthesis Card */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '2rem',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Glowing Accent */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '4px',
              background: 'linear-gradient(90deg, var(--highlight), var(--accent))'
            }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Sparkles size={18} style={{ color: 'var(--accent)' }} />
              <span className="eyebrow" style={{ letterSpacing: '2px', fontWeight: 600, color: 'var(--accent)' }}>AI SEARCH SUMMARY</span>
            </div>

            <div style={{
              fontSize: '1.05rem',
              lineHeight: 1.6,
              opacity: 0.95,
              whiteSpace: 'pre-line'
            }} className="markdown-body">
              {result.summary}
            </div>
          </div>

          {/* Matched Emails List */}
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={18} />
              Relevance Matches ({result.matches.length})
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {result.matches.map((email, idx) => (
                <div
                  key={email.id}
                  style={{
                    background: 'var(--panel-elevated)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    transition: 'all 0.2s hover'
                  }}
                  className="email-match-card"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{email.senderName || email.sender}</span>
                      <span className="badge badge-normal" style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                        {email.category.toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                      {new Date(email.receivedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                    {email.subject}
                  </h4>

                  <p style={{ margin: 0, fontSize: '0.82rem', opacity: 0.75, lineHeight: 1.4 }}>
                    {email.snippet}
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
