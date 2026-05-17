import { useState, useEffect } from 'react';
import axios from 'axios';
import { Network, Sparkles, BrainCircuit, Loader, MessageSquare, Plus, GitCommit } from 'lucide-react';

const API_BASE = '/api/ai/memory';

export default function MemoryGraphPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [data, setData] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [indexMessage, setIndexMessage] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');

  const fetchGraphDetails = async () => {
    try {
      const res = await axios.get(`${API_BASE}/entities`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch graph items:', err.message);
    }
  };

  useEffect(() => {
    fetchGraphDetails();
  }, []);

  const handleQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearchResult(null);
    try {
      const res = await axios.post(
        `${API_BASE}/query`,
        { query },
        { headers: { Authorization: `Bearer={token}` } }
      );
      setSearchResult(res.data);
    } catch (err) {
      console.error(err);
      setSearchResult({
        summary: '⚠️ Connection failed. Verify your database and AI routers are online.',
        nodes: [],
        edges: []
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLearnGraph = async () => {
    setIndexing(true);
    setIndexMessage('Extracting entities & relations from your inbox. Building Knowledge Graph network...');
    try {
      const res = await axios.post(
        `${API_BASE}/extract-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIndexMessage(`✅ ${res.data.message}`);
      await fetchGraphDetails();
    } catch (err) {
      setIndexMessage('⚠️ Knowledge extraction failed. Ensure your Groq API is online.');
    } finally {
      setIndexing(false);
      setTimeout(() => setIndexMessage(''), 8000);
    }
  };

  const metrics = data?.metrics || {
    totalEntities: 0,
    totalRelationships: 0,
    peopleCount: 0,
    companiesCount: 0,
    commitmentsCount: 0
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
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BrainCircuit size={20} style={{ color: '#10b981' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>AI Relationship Learning Engine</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.75 }}>Scan your recent communication history to map and construct your relation net.</p>
          </div>
        </div>
        <button
          className="button button-ghost"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: '#10b981', color: '#34d399' }}
          onClick={handleLearnGraph}
          disabled={indexing}
        >
          {indexing ? <Loader size={14} className="animate-spin" /> : <Network size={14} />}
          {indexing ? 'Learning Network...' : 'Extract Graph'}
        </button>
      </div>

      {indexMessage && (
        <div className="pulse-card" style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          {indexMessage}
        </div>
      )}

      {/* Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
        {[
          { label: 'Network Entities', value: metrics.totalEntities, color: 'var(--accent)' },
          { label: 'Graph Relationships', value: metrics.totalRelationships, color: 'var(--success)' },
          { label: 'Contacts Mapped', value: metrics.peopleCount, color: 'var(--cyan)' },
          { label: 'Key Companies', value: metrics.companiesCount, color: 'var(--highlight)' },
          { label: 'Promises Tracked', value: metrics.commitmentsCount, color: 'var(--error)' }
        ].map((m, idx) => (
          <div
            key={idx}
            style={{
              background: 'var(--panel-elevated)',
              border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: '16px',
              padding: '1.25rem',
              textAlign: 'center'
            }}
          >
            <span style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px' }}>{m.label}</span>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, margin: '0.25rem 0 0 0', color: m.color }}>{m.value}</h2>
          </div>
        ))}
      </div>

      {/* Query/Graph Search Input Lockup */}
      <div style={{
        background: 'var(--panel-elevated)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '24px',
        padding: '2rem',
        marginBottom: '2.5rem'
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: 600 }}>Query Relationship Network</h3>
        <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', opacity: 0.75 }}>Ask the AI Memory Engine about commitments, promises, timelines, or company links.</p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.15)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          padding: '0.5rem 0.5rem 0.5rem 1.25rem'
        }}>
          <MessageSquare size={18} style={{ opacity: 0.5, marginRight: '0.75rem' }} />
          <input
            type="text"
            placeholder="e.g. What commitments did I make to Microsoft last quarter?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '0.95rem'
            }}
          />
          <button
            className="button button-primary"
            style={{ borderRadius: '12px', padding: '0.5rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            onClick={handleQuery}
            disabled={loading}
          >
            {loading ? <Loader className="animate-spin" size={14} /> : <BrainCircuit size={14} />}
            Query Memory
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Loader className="animate-spin text-accent" size={30} style={{ margin: '0 auto 0.5rem auto' }} />
            <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Traversing graph nodes & edges...</p>
          </div>
        )}

        {searchResult && (
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sparkles size={16} style={{ color: 'var(--accent)' }} />
              <span className="eyebrow" style={{ color: 'var(--accent)', fontWeight: 600 }}>AI MEMORY BRIEF</span>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {searchResult.summary}
            </div>

            {/* Queried Nodes list if any */}
            {searchResult.nodes?.length > 0 && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem' }}>
                <span className="eyebrow" style={{ fontSize: '0.7rem', display: 'block', marginBottom: '0.5rem' }}>RESOLVED GRAPHS NODES</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {searchResult.nodes.map((node, i) => (
                    <span key={i} className="badge badge-normal" style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '10px' }}>
                      {node.name} ({node.type})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid of Nodes and Connections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        
        {/* Extracted Entities */}
        <div style={{ background: 'var(--panel-elevated)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Network size={16} style={{ color: 'var(--cyan)' }} />
            Indexed Entities ({data?.nodes?.length || 0})
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {data?.nodes?.length === 0 ? (
              <p style={{ opacity: 0.6, fontSize: '0.8rem', textAlign: 'center', margin: '2rem 0' }}>No learned entities yet. Click "Extract Graph" to scan your communications.</p>
            ) : (
              data?.nodes?.map((node) => (
                <div
                  key={node.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '12px'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{node.name}</span>
                    <p style={{ margin: 0, fontSize: '0.72rem', opacity: 0.7 }}>{node.description}</p>
                  </div>
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.65rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '8px',
                      background: node.type === 'person' ? 'rgba(6, 182, 212, 0.1)' : node.type === 'company' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                      color: node.type === 'person' ? '#22d3ee' : node.type === 'company' ? '#818cf8' : '#fb7185',
                      border: '1px solid currentColor'
                    }}
                  >
                    {node.type.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Knowledge Connections / Edges */}
        <div style={{ background: 'var(--panel-elevated)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '20px', padding: '1.5rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GitCommit size={16} style={{ color: 'var(--success)' }} />
            Graph Relationships ({data?.relations?.length || 0})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '350px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {data?.relations?.length === 0 ? (
              <p style={{ opacity: 0.6, fontSize: '0.8rem', textAlign: 'center', margin: '2rem 0' }}>No graph relation links mapped yet.</p>
            ) : (
              data?.relations?.map((rel) => (
                <div
                  key={rel.id}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '12px',
                    fontSize: '0.8rem',
                    lineHeight: 1.4
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                    <strong style={{ color: 'var(--text)' }}>{rel.source}</strong>
                    <span style={{ opacity: 0.5, fontStyle: 'italic', fontSize: '0.75rem' }}>({rel.type})</span>
                    <span style={{ opacity: 0.6 }}>→</span>
                    <strong style={{ color: 'var(--accent)' }}>{rel.target}</strong>
                  </div>
                  <span style={{ fontSize: '0.65rem', opacity: 0.5, display: 'block', marginTop: '0.25rem' }}>
                    Extracted {new Date(rel.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
