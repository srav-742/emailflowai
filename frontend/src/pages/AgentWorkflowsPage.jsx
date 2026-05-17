import { useState, useEffect } from 'react';
import axios from 'axios';
import { Bot, Sparkles, Check, X, Calendar, FileText, Mail, Loader, PlayCircle } from 'lucide-react';

const API_BASE = '/api/agent';

export default function AgentWorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(null);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token') || '');

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/workflows`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWorkflows(res.data);
    } catch (err) {
      console.error('Failed to fetch agent workflows:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleApprove = async (id) => {
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE}/workflows/${id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(`✅ ${res.data.message}`);
      await fetchWorkflows();
    } catch (err) {
      setMessage('❌ Failed to execute approved workflow tools.');
    }
  };

  const handleReject = async (id) => {
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE}/workflows/${id}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(`✅ ${res.data.message}`);
      await fetchWorkflows();
    } catch (err) {
      setMessage('❌ Failed to reject proposed workflow.');
    }
  };

  const handleSimulate = async (type) => {
    setSimulating(type);
    setMessage('');
    try {
      const res = await axios.post(
        `${API_BASE}/simulate-trigger`,
        { type },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(`✅ Simulated inbound ${type.replace('_', ' ')}! Workflow generated below.`);
      await fetchWorkflows();
    } catch (err) {
      setMessage('❌ Trigger simulation failed.');
    } finally {
      setSimulating(null);
    }
  };

  const pendingList = workflows.filter(w => w.status === 'pending');
  const executedList = workflows.filter(w => w.status !== 'pending');

  return (
    <div className="analytics-container fade-in" style={{ padding: '1rem', color: 'var(--text)' }}>
      
      {/* Sandbox Simulator Widget */}
      <div style={{
        background: 'var(--panel-elevated)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '20px',
        padding: '1.5rem',
        marginBottom: '2.5rem'
      }}>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PlayCircle size={18} className="text-accent" style={{ color: 'var(--accent)' }} />
          Agent Sandbox Trigger Simulator
        </h3>
        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', opacity: 0.75 }}>
          Mock an inbound email event to test how the AI Orchestrator acts on meeting proposals, overdue invoices, or deployments.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {[
            { label: 'Simulate Meeting Request', type: 'meeting_request', color: 'var(--accent)' },
            { label: 'Simulate Unpaid Invoice Alert', type: 'invoice_overdue', color: 'var(--success)' },
            { label: 'Simulate incident Outage alarm', type: 'system_incident', color: 'var(--error)' }
          ].map((s) => (
            <button
              key={s.type}
              className="button button-ghost"
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.82rem', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              disabled={simulating !== null}
              onClick={() => handleSimulate(s.type)}
            >
              {simulating === s.type ? <Loader size={14} className="animate-spin" /> : <Bot size={14} />}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <div className="pulse-card" style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          {message}
        </div>
      )}

      {/* Main Flow Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
        
        {/* Pending approvals column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bot size={20} style={{ color: 'var(--accent)' }} />
            Pending Autonomous Actions ({pendingList.length})
          </h3>

          {loading && pendingList.length === 0 ? (
            <div style={{ textAlign: 'center', margin: '4rem 0' }}>
              <Loader size={30} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Loading workflow ledger...</p>
            </div>
          ) : pendingList.length === 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.1)',
              borderRadius: '20px',
              padding: '3rem 1.5rem',
              textAlign: 'center'
            }}>
              <Bot size={32} style={{ opacity: 0.3, margin: '0 auto 0.75rem auto' }} />
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, opacity: 0.8 }}>Queue Clear</h4>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', opacity: 0.6 }}>No pending workflows are waiting for review. Click a simulation trigger above to spin one up!</p>
            </div>
          ) : (
            pendingList.map((wf) => (
              <div
                key={wf.id}
                style={{
                  background: 'var(--panel-elevated)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '20px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Accent line based on trigger */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '4px',
                  background: wf.triggerType === 'meeting_request' ? 'var(--accent)' : wf.triggerType === 'invoice_overdue' ? 'var(--success)' : 'var(--error)'
                }}></div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span className="eyebrow" style={{ fontSize: '0.7rem', fontWeight: 600 }}>TRIGGER: {wf.triggerType.toUpperCase()}</span>
                    <span style={{ fontSize: '0.72rem', opacity: 0.6 }}>{new Date(wf.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{wf.title}</h4>
                </div>

                {/* AI Rationale explanation */}
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  opacity: 0.9,
                  display: 'flex',
                  gap: '0.5rem'
                }}>
                  <Sparkles size={16} className="text-accent" style={{ flexShrink: 0, color: 'var(--accent)', marginTop: '0.1rem' }} />
                  <div>
                    <strong>AI Rationale:</strong> {wf.description}
                  </div>
                </div>

                {/* Tool Checklist */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span className="eyebrow" style={{ fontSize: '0.68rem', opacity: 0.7 }}>PROPOSED TOOLS STACK ({Object.keys(wf.actionData).length})</span>
                  
                  {wf.actionData.createCalendarEvent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <Calendar size={14} style={{ color: 'var(--accent)' }} />
                      <span>Create calendar event: <strong>{wf.actionData.createCalendarEvent.title}</strong></span>
                    </div>
                  )}

                  {wf.actionData.createTask && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <FileText size={14} style={{ color: 'var(--cyan)' }} />
                      <span>Append action item task: <strong>{wf.actionData.createTask.title}</strong></span>
                    </div>
                  )}

                  {wf.actionData.proposedDraftReply && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                        <Mail size={14} style={{ color: 'var(--success)' }} />
                        <span>Queue style-aware response:</span>
                      </div>
                      <pre style={{
                        margin: 0,
                        padding: '0.75rem',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        color: '#a5f3fc',
                        whiteSpace: 'pre-wrap',
                        border: '1px solid rgba(255,255,255,0.03)'
                      }}>{wf.actionData.proposedDraftReply}</pre>
                    </div>
                  )}
                </div>

                {/* Action button row */}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    className="button button-primary"
                    style={{ flex: 1, padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    onClick={() => handleApprove(wf.id)}
                  >
                    <Check size={14} />
                    Approve Workflow
                  </button>
                  <button
                    className="button button-ghost"
                    style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderColor: 'var(--error)', color: '#f87171' }}
                    onClick={() => handleReject(wf.id)}
                  >
                    <X size={14} />
                    Reject
                  </button>
                </div>

              </div>
            ))
          )}
        </div>

        {/* Executed History column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.8 }}>
            <Check size={20} style={{ color: 'var(--success)' }} />
            Action Log History
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.8 }}>
            {executedList.length === 0 ? (
              <p style={{ opacity: 0.5, fontSize: '0.8rem', textAlign: 'center', margin: '2rem 0' }}>No workflows have been executed or rejected in this session yet.</p>
            ) : (
              executedList.map((wf) => (
                <div
                  key={wf.id}
                  style={{
                    padding: '1rem 1.25rem',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{wf.title}</span>
                    <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.6 }}>Trigger: {wf.triggerType}</p>
                  </div>
                  
                  <span
                    className="badge"
                    style={{
                      fontSize: '0.62rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '8px',
                      background: wf.status === 'executed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: wf.status === 'executed' ? '#34d399' : '#f87171',
                      border: '1px solid currentColor'
                    }}
                  >
                    {wf.status.toUpperCase()}
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
