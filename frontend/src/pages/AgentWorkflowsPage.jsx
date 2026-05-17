import { useEffect, useState } from 'react';
import RecoverableErrorState from '../components/RecoverableErrorState';
import { agentAPI } from '../services/api';

const AgentWorkflowsPage = () => {
  const [status, setStatus] = useState('PENDING');
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const loadWorkflows = async (nextStatus = status) => {
    const response = await agentAPI.list(nextStatus);
    setWorkflows(response.data.workflows || []);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await loadWorkflows();
      } catch (loadError) {
        if (active) {
          setError('Agent workflows could not be loaded.');
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

  const handleDecision = async (id, action) => {
    try {
      setBusyId(id);
      setError(null);
      if (action === 'approve') {
        await agentAPI.approve(id);
      } else {
        await agentAPI.reject(id);
      }
      await loadWorkflows();
    } catch (decisionError) {
      setError(decisionError.response?.data?.message || 'Workflow update failed.');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusChange = async (nextStatus) => {
    setStatus(nextStatus);
    setLoading(true);
    try {
      await loadWorkflows(nextStatus);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading-shell">
        <div className="app-loading-card">
          <div className="app-loading-spinner"></div>
          <p>Loading agent workflows...</p>
        </div>
      </div>
    );
  }

  if (error && workflows.length === 0) {
    return (
      <RecoverableErrorState
        title="Workflow Queue Unavailable"
        message={error}
        retryLabel="Retry"
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span className="eyebrow">Stage 3 / Agent Orchestrator</span>
          <h1 style={{ fontSize: '2.1rem' }}>Workflow Approval Engine</h1>
          <p className="page-subtitle">Approve, reject, or inspect autonomous workflow suggestions before any execution.</p>
        </div>
      </div>

      <div className="surface-card" style={{ padding: '1.2rem', marginBottom: '1.4rem' }}>
        <div className="button-row">
          <button className={`button ${status === 'PENDING' ? 'button-primary' : 'button-ghost'}`} onClick={() => void handleStatusChange('PENDING')}>
            Pending
          </button>
          <button className={`button ${status === 'APPROVED' ? 'button-primary' : 'button-ghost'}`} onClick={() => void handleStatusChange('APPROVED')}>
            Approved
          </button>
          <button className={`button ${status === 'REJECTED' ? 'button-primary' : 'button-ghost'}`} onClick={() => void handleStatusChange('REJECTED')}>
            Rejected
          </button>
        </div>
      </div>

      {error ? <div className="status-pill status-warn" style={{ marginBottom: '1rem' }}>{error}</div> : null}

      <div className="stack-list">
        {workflows.length === 0 ? (
          <div className="empty-card">
            <h3>No workflows in {status.toLowerCase()} state.</h3>
            <p>New triggers will appear here after email sync detects automation opportunities.</p>
          </div>
        ) : (
          workflows.map((workflow) => (
            <article key={workflow.id} className="surface-card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem' }}>
                <div>
                  <span className="mail-label">{workflow.type}</span>
                  <h3 style={{ marginTop: '0.4rem', marginBottom: '0.4rem' }}>{workflow.explanation}</h3>
                </div>
                <span className={`status-pill ${workflow.status === 'PENDING' ? 'status-warn' : 'status-ok'}`}>
                  {workflow.status}
                </span>
              </div>

              <p style={{ color: 'var(--text-dim)', marginBottom: '0.6rem' }}>
                Created {new Date(workflow.createdAt).toLocaleString()}
              </p>

              <pre style={{
                margin: 0,
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '10px',
                padding: '0.8rem',
                overflowX: 'auto',
                fontSize: '0.8rem',
              }}>
                {JSON.stringify(workflow.payload, null, 2)}
              </pre>

              {workflow.status === 'PENDING' ? (
                <div className="button-row" style={{ marginTop: '0.8rem' }}>
                  <button
                    className="button button-primary"
                    onClick={() => void handleDecision(workflow.id, 'approve')}
                    disabled={busyId === workflow.id}
                  >
                    {busyId === workflow.id ? 'Updating...' : 'Approve'}
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => void handleDecision(workflow.id, 'reject')}
                    disabled={busyId === workflow.id}
                  >
                    {busyId === workflow.id ? 'Updating...' : 'Reject'}
                  </button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default AgentWorkflowsPage;
