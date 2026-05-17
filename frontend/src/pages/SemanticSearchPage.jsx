import { useEffect, useState } from 'react';
import RecoverableErrorState from '../components/RecoverableErrorState';
import { semanticAPI, stage3API } from '../services/api';

const SemanticSearchPage = () => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(null);
  const [verification, setVerification] = useState(null);
  const [summary, setSummary] = useState('Index your inbox first, then ask natural-language questions across your communication history.');
  const [matches, setMatches] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [searching, setSearching] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState(null);

  const refreshStatus = async () => {
    const [statusResponse, verifyResponse] = await Promise.all([
      semanticAPI.status(),
      stage3API.verify(),
    ]);

    setStatus(statusResponse.data);
    setVerification(verifyResponse.data);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoadingStatus(true);
        await refreshStatus();
      } catch (loadError) {
        if (active) {
          setError('Semantic search status is unavailable right now.');
        }
      } finally {
        if (active) {
          setLoadingStatus(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleIndex = async () => {
    try {
      setIndexing(true);
      setError(null);
      const response = await semanticAPI.index({ limit: 300 });
      setStatus(response.data.status);
      setSummary(`Indexed ${response.data.status.indexedThisRun} emails in this run. Current semantic coverage: ${response.data.status.coverage}%.`);
      await refreshStatus();
    } catch (indexError) {
      setError(indexError.response?.data?.message || 'Indexing failed.');
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    try {
      setSearching(true);
      setError(null);
      const response = await semanticAPI.search(query, { limit: 10 });
      setSummary(response.data.summary || 'Search completed.');
      setMatches(response.data.matches || []);
    } catch (searchError) {
      setError(searchError.response?.data?.message || 'Semantic search failed.');
    } finally {
      setSearching(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Loading semantic intelligence...</p>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <RecoverableErrorState
        title="Semantic Search Unavailable"
        message={error || 'The semantic search service is currently unavailable.'}
        retryLabel="Retry"
        onRetry={() => void refreshStatus()}
      />
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow">Stage 3 / Semantic AI Search</span>
          <h1 style={{ fontSize: '2.2rem' }}>Natural-Language Communication Recall</h1>
          <p className="page-subtitle">Search your full inbox by intent, not keywords.</p>
        </div>
      </div>

      <div className="bento-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="bento-col-4">
          <div className="surface-card" style={{ padding: '1.4rem' }}>
            <span className="eyebrow">Coverage</span>
            <h2 style={{ margin: '0.4rem 0', fontSize: '1.9rem' }}>{status.coverage || 0}%</h2>
            <p style={{ color: 'var(--text-dim)' }}>{status.indexedEmails || 0} / {status.totalEmails || 0} indexed</p>
          </div>
        </div>
        <div className="bento-col-4">
          <div className="surface-card" style={{ padding: '1.4rem' }}>
            <span className="eyebrow">Embedding Layer</span>
            <h2 style={{ margin: '0.4rem 0', fontSize: '1.2rem' }}>{status.model}</h2>
            <p style={{ color: 'var(--text-dim)' }}>{status.provider}</p>
          </div>
        </div>
        <div className="bento-col-4">
          <div className="surface-card" style={{ padding: '1.4rem' }}>
            <span className="eyebrow">Last Indexed</span>
            <h2 style={{ margin: '0.4rem 0', fontSize: '1rem' }}>
              {status.lastIndexedAt ? new Date(status.lastIndexedAt).toLocaleString() : 'Not indexed yet'}
            </h2>
            <p style={{ color: 'var(--text-dim)' }}>{status.pendingEmails || 0} pending</p>
          </div>
        </div>
      </div>

      {verification?.systems ? (
        <div className="surface-card" style={{ padding: '1.4rem', marginBottom: '1.5rem' }}>
          <span className="eyebrow">Runtime Verification Layer</span>
          <div style={{ marginTop: '0.8rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <span className="mail-label">Embeddings: {verification.systems.embeddings.ready ? 'Ready' : 'Pending'}</span>
            <span className="mail-label">Memory Graph: {verification.systems.memoryGraph.ready ? 'Ready' : 'Pending'}</span>
            <span className="mail-label">Pending Workflows: {verification.systems.agentWorkflow.pendingApprovals}</span>
            <span className="mail-label">Runtime: {verification.systems.runtime.degraded ? 'Degraded' : 'Healthy'}</span>
          </div>
        </div>
      ) : null}

      <div className="surface-card" style={{ padding: '1.8rem', marginBottom: '1.5rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'grid', gap: '0.9rem' }}>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={3}
            placeholder='Try: "find invoices from Amazon over $500"'
            style={{
              width: '100%',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'var(--panel-elevated)',
              color: 'var(--text)',
              padding: '0.95rem',
            }}
          />
          <div className="button-row">
            <button className="button button-secondary" type="button" onClick={() => void refreshStatus()}>
              Refresh Status
            </button>
            <button className="button button-primary" type="button" onClick={handleIndex} disabled={indexing}>
              {indexing ? 'Indexing...' : 'Index Inbox'}
            </button>
            <button className="button button-primary" type="submit" disabled={searching || !query.trim()}>
              {searching ? 'Searching...' : 'Run Semantic Search'}
            </button>
          </div>
        </form>
        {error ? <div className="status-pill status-warn" style={{ marginTop: '0.8rem' }}>{error}</div> : null}
      </div>

      <div className="surface-card" style={{ padding: '1.8rem' }}>
        <span className="eyebrow">AI Summary</span>
        <p style={{ marginTop: '0.5rem', color: 'var(--text)' }}>{summary}</p>

        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {matches.length === 0 ? (
            <div className="empty-card">
              <h3>No semantic matches yet</h3>
              <p>Index your inbox and run a natural-language query to see ranked threads.</p>
            </div>
          ) : (
            matches.map((entry) => (
              <article key={entry.id} className="surface-card" style={{ padding: '1rem', background: 'var(--panel-elevated)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem' }}>
                  <strong>{entry.subject || 'No subject'}</strong>
                  <span className="status-pill status-ok">Match {Math.round((entry.similarity || 0) * 100)}%</span>
                </div>
                <p style={{ marginTop: '0.4rem', color: 'var(--text-dim)' }}>{entry.summary || entry.snippet || 'No preview available.'}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  <span className="mail-label">{entry.category || 'uncategorized'}</span>
                  <span className="mail-label">{entry.priority || 'normal'}</span>
                  <span className="mail-label">{new Date(entry.receivedAt).toLocaleString()}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SemanticSearchPage;
