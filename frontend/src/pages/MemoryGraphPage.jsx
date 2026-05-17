import { useEffect, useState } from 'react';
import RecoverableErrorState from '../components/RecoverableErrorState';
import { memoryAPI } from '../services/api';

const MemoryGraphPage = () => {
  const [question, setQuestion] = useState('What commitments did I make last quarter?');
  const [nodes, setNodes] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState(null);

  const loadOverview = async () => {
    const response = await memoryAPI.overview();
    setOverview(response.data);
  };

  const runQuery = async (nextQuestion = question) => {
    const response = await memoryAPI.query(nextQuestion);
    setNodes(response.data.nodes || []);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        await Promise.all([loadOverview(), runQuery()]);
      } catch (loadError) {
        if (active) {
          setError('Memory graph is currently unavailable.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    try {
      setQuerying(true);
      setError(null);
      await runQuery();
      await loadOverview();
    } catch (queryError) {
      setError(queryError.response?.data?.message || 'Memory query failed.');
    } finally {
      setQuerying(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Building relationship memory context...</p>
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <RecoverableErrorState
        title="Memory Graph Unavailable"
        message={error}
        retryLabel="Reload Memory"
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow">Stage 3 / Memory Graph</span>
          <h1 style={{ fontSize: '2.1rem' }}>Relationship Memory Intelligence</h1>
          <p className="page-subtitle">Explore extracted people, projects, organizations, and timeline entities from your inbox.</p>
        </div>
      </div>

      <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="bento-col-6">
          <div className="surface-card" style={{ padding: '1.4rem' }}>
            <span className="eyebrow">Nodes by Type</span>
            <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {(overview?.nodesByType || []).map((entry) => (
                <span key={`${entry.type}-${entry.count}`} className="mail-label">
                  {entry.type}: {entry.count}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="bento-col-6">
          <div className="surface-card" style={{ padding: '1.4rem' }}>
            <span className="eyebrow">Relations by Type</span>
            <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {(overview?.relationsByType || []).map((entry) => (
                <span key={`${entry.relationType}-${entry.count}`} className="mail-label">
                  {entry.relationType}: {entry.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card" style={{ padding: '1.6rem', marginBottom: '1.5rem' }}>
        <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.8rem' }}>
          <textarea
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--panel-elevated)',
              color: 'var(--text)',
              padding: '0.9rem',
            }}
          />
          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={querying || !question.trim()}>
              {querying ? 'Querying...' : 'Query Memory'}
            </button>
          </div>
        </form>
      </div>

      <div className="surface-card" style={{ padding: '1.6rem' }}>
        <span className="eyebrow">Query Results</span>
        <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {nodes.length === 0 ? (
            <div className="empty-card">
              <h3>No nodes matched this query.</h3>
              <p>Try asking about a person, project, organization, or timeline window.</p>
            </div>
          ) : (
            nodes.map((node) => (
              <article key={node.id} className="surface-card" style={{ padding: '0.9rem', background: 'var(--panel-elevated)' }}>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span className="mail-label">{node.type}</span>
                  <strong>{node.value}</strong>
                </div>
                <p style={{ color: 'var(--text-dim)', marginTop: '0.3rem' }}>
                  Captured {new Date(node.createdAt).toLocaleString()}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MemoryGraphPage;
