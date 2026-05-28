import { useEffect, useState } from 'react';
import { automationAPI } from '../services/api';
import RecoverableErrorState from '../components/RecoverableErrorState';
import './AutomationPage.css';

// Lucide icons simulation (inline SVGs for complete self-containment)
const SparklesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
);
const TerminalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
);
const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
);
const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
);
const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/><line x1="12" y1="7" x2="12" y2="12"/><polyline points="12 12 16.02 14.3"/></svg>
);

const AutomationPage = () => {
  const [prompt, setPrompt] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [compiledWorkflow, setCompiledWorkflow] = useState(null);
  
  // Custom workflows & history lists
  const [workflows, setWorkflows] = useState([]);
  const [runs, setRuns] = useState([]);
  
  // Simulator State
  const [simulating, setSimulating] = useState(false);
  const [simulationReport, setSimulationReport] = useState(null);
  
  // Tabs & Views
  const [activeTab, setActiveTab] = useState('editor'); // 'editor', 'history'
  const [expandedRunId, setExpandedRunId] = useState(null);
  
  // UI Alerts/Statuses
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [showJsonMode, setShowJsonMode] = useState(false);

  const suggestions = [
    "Archive newsletters after 7 days",
    "Notify me when CEO emails arrive",
    "Label invoices from Stripe and notify Slack",
    "Forward contracts to legal",
    "Summarize unread emails every morning"
  ];

  const loadDashboard = async () => {
    try {
      const wRes = await automationAPI.list();
      setWorkflows(wRes.data.workflows || []);
      const rRes = await automationAPI.runs();
      setRuns(rRes.data.runs || []);
    } catch (err) {
      console.error('Error loading automation workspace:', err);
      setError('Failed to fetch workflows data.');
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleSuggestionClick = (text) => {
    setPrompt(text);
    setError(null);
    setSuccessMsg(null);
  };

  const handleCompile = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setCompiling(true);
    setError(null);
    setSuccessMsg(null);
    setCompiledWorkflow(null);
    setSimulationReport(null);

    try {
      const response = await automationAPI.create(prompt);
      if (response.data.success) {
        setCompiledWorkflow(response.data.workflow.workflow_json);
        setSuccessMsg(`Workflow compiled and saved successfully as "${response.data.workflow.name}"!`);
        await loadDashboard();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'AI compiler encountered a syntax mapping error. Please refine your instruction.');
    } finally {
      setCompiling(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!compiledWorkflow) return;
    setSimulating(true);
    setError(null);
    try {
      const response = await automationAPI.test(compiledWorkflow);
      if (response.data.success) {
        setSimulationReport(response.data.simulation);
      }
    } catch (err) {
      setError('Simulation dry-run failed.');
    } finally {
      setSimulating(false);
    }
  };

  const handleToggle = async (id, currentEnabled) => {
    try {
      const nextState = !currentEnabled;
      const response = await automationAPI.toggle(id, nextState);
      if (response.data.success) {
        setWorkflows(prev => prev.map(w => w.id === id ? { ...w, enabled: response.data.enabled } : w));
        setSuccessMsg(`Workflow state updated successfully.`);
      }
    } catch (err) {
      setError('Failed to toggle workflow status.');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this automation?')) return;
    try {
      const response = await automationAPI.delete(id);
      if (response.data.success) {
        setWorkflows(prev => prev.filter(w => w.id !== id));
        if (compiledWorkflow && compiledWorkflow.id === id) {
          setCompiledWorkflow(null);
        }
        setSuccessMsg('Automation workflow deleted successfully.');
        await loadDashboard();
      }
    } catch (err) {
      setError('Failed to delete workflow.');
    }
  };

  const handleJsonChange = (e) => {
    try {
      const parsed = JSON.parse(e.target.value);
      setCompiledWorkflow(parsed);
      setError(null);
    } catch (err) {
      setError('Malformed JSON format.');
    }
  };

  return (
    <div className="automation-workspace">
      {/* Dynamic Header banner */}
      <section className="automation-hero">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--automation-accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          <SparklesIcon /> Stage 4 / Artificial Intelligence Orchestrator
        </span>
        <h1>Natural Language Automation OS</h1>
        <p>Compile everyday language into sandboxed, secure automation pipelines matching filters and actions deterministically.</p>
      </section>

      {/* Primary Workspace Navigation Tabs */}
      <div className="button-row" style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '0.4rem', borderRadius: '10px', border: '1px solid var(--automation-border)' }}>
        <button className={`button ${activeTab === 'editor' ? 'button-primary' : 'button-ghost'}`} onClick={() => setActiveTab('editor')}>
          <SparklesIcon /> Workspace Compiler
        </button>
        <button className={`button ${activeTab === 'history' ? 'button-primary' : 'button-ghost'}`} onClick={() => setActiveTab('history')}>
          <HistoryIcon /> Execution Monitor ({runs.length})
        </button>
      </div>

      {activeTab === 'editor' && (
        <div className="automation-grid">
          {/* Left panel: Prompt console & Visual editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Prompter console */}
            <article className="automation-card">
              <h2 className="automation-card-title">
                <SparklesIcon /> Describe Your Automation
              </h2>
              <form onSubmit={handleCompile} className="prompt-console">
                <div className="prompt-textarea-wrapper">
                  <textarea
                    className="prompt-textarea"
                    placeholder="Enter your instruction e.g., 'When invoices arrive from Stripe, label them Finance and notify Slack'..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={compiling}
                  />
                </div>
                <div className="prompt-suggestions">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="suggestion-badge"
                      onClick={() => handleSuggestionClick(s)}
                      disabled={compiling}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="submit"
                    className="automation-btn"
                    disabled={compiling || !prompt.trim()}
                  >
                    {compiling ? (
                      <>
                        <div className="app-loading-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>
                        Compiling Pipeline...
                      </>
                    ) : (
                      <>
                        <SparklesIcon /> Compile Instruction
                      </>
                    )}
                  </button>
                </div>
              </form>
            </article>

            {/* Error / Success Display messages */}
            {error && (
              <div className="status-pill status-warn" style={{ color: 'var(--automation-error)', background: 'rgba(239, 68, 68, 0.12)' }}>
                ⚠️ {error}
              </div>
            )}
            {successMsg && (
              <div className="status-pill status-ok" style={{ color: 'var(--automation-success)', background: 'rgba(16, 185, 129, 0.12)' }}>
                <CheckIcon /> {successMsg}
              </div>
            )}

            {/* Interactive Rule Builder visual pipeline */}
            {(compiledWorkflow || compiling) && (
              <article className="automation-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 className="automation-card-title">
                    <TerminalIcon /> Interactive Pipeline Preview
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--automation-text-secondary)' }}>
                    <span>Advanced JSON</span>
                    <label className="switch-control">
                      <input
                        type="checkbox"
                        checked={showJsonMode}
                        onChange={() => setShowJsonMode(!showJsonMode)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                </div>

                {compiling ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="pipeline-node shimmer-pulse" style={{ height: '70px' }}></div>
                    <div className="node-connector" style={{ opacity: 0.3 }}></div>
                    <div className="pipeline-node shimmer-pulse" style={{ height: '80px' }}></div>
                    <div className="node-connector" style={{ opacity: 0.3 }}></div>
                    <div className="pipeline-node shimmer-pulse" style={{ height: '70px' }}></div>
                  </div>
                ) : (
                  <div className="pipeline-builder">
                    {showJsonMode ? (
                      <textarea
                        className="prompt-textarea"
                        style={{ fontFamily: 'monospace', fontSize: '0.8rem', minHeight: '300px' }}
                        value={JSON.stringify(compiledWorkflow, null, 2)}
                        onChange={handleJsonChange}
                      />
                    ) : (
                      <>
                        {/* 1. Trigger node */}
                        <div className="pipeline-node trigger">
                          <div className="node-header">
                            <span className="node-badge">Trigger Source</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Real-time event sync</span>
                          </div>
                          <strong style={{ fontSize: '1rem', color: '#fff' }}>
                            {compiledWorkflow.trigger.type === 'email_received' ? 'New Email Arrives' : 'Scheduler Timer'}
                          </strong>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--automation-text-secondary)' }}>
                            Fired immediately upon syncing message headers and contents.
                          </p>
                        </div>

                        <div className="node-connector"></div>

                        {/* 2. Match Conditions node */}
                        <div className="pipeline-node condition">
                          <div className="node-header">
                            <span className="node-badge">Match Conditions</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>json-rules-engine evaluate</span>
                          </div>
                          {compiledWorkflow.trigger.conditions && compiledWorkflow.trigger.conditions.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.2rem' }}>
                              {compiledWorkflow.trigger.conditions.map((cond, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                  <span style={{ color: 'var(--automation-accent)', fontWeight: 600 }}>{cond.field}</span>
                                  <span style={{ opacity: 0.6 }}>{cond.operator.replace('_', ' ')}</span>
                                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid var(--automation-border)', color: '#fff' }}>
                                    "{cond.value}"
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <strong style={{ color: 'var(--automation-warn)', fontSize: '0.85rem' }}>
                              ⚠️ Unrestricted filters. Matches all incoming emails.
                            </strong>
                          )}
                        </div>

                        <div className="node-connector"></div>

                        {/* 3. Action nodes */}
                        <div className="pipeline-node action">
                          <div className="node-header">
                            <span className="node-badge">Action Executors</span>
                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Modular sandbox queue</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginTop: '0.4rem' }}>
                            {compiledWorkflow.actions.map((action, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '0.6rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                  <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, color: 'var(--automation-success)' }}>
                                    {action.type.replace('_', ' ')}
                                  </span>
                                  {action.value && (
                                    <span style={{ fontSize: '0.8rem', opacity: 0.8, color: '#fff' }}>
                                      Target details: <code style={{ fontFamily: 'monospace', color: '#c084fc' }}>{action.value}</code>
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Loops / Safety Checker results */}
                        <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--automation-success)' }}>
                            <CheckIcon /> Safety validation checks passed: Loop recursive checks & Auto-delete guards.
                          </span>
                        </div>
                      </>
                    )}

                    {/* Dry-run Simulator action button */}
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                      <button
                        type="button"
                        className="automation-btn automation-btn-secondary"
                        onClick={handleRunSimulation}
                        disabled={simulating}
                        style={{ flex: 1 }}
                      >
                        {simulating ? 'Running simulation...' : 'Simulate Dry-Run on Inbox'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )}

            {/* Simulation results details panel */}
            {simulationReport && (
              <article className="automation-card">
                <h2 className="automation-card-title">
                  <EyeIcon /> Dry-Run Simulation Report
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Total Emails Scanned</span>
                    <h3 style={{ fontSize: '1.8rem', margin: '0.2rem 0 0 0', fontWeight: 700 }}>
                      {simulationReport.totalEmailsScanned}
                    </h3>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Matched Matches</span>
                    <h3 style={{ fontSize: '1.8rem', margin: '0.2rem 0 0 0', fontWeight: 700, color: 'var(--automation-success)' }}>
                      {simulationReport.matchedCount}
                    </h3>
                  </div>
                </div>

                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Simulation Action Logs:</span>
                <div className="simulation-log-box">
                  {simulationReport.expectedActions.length === 0 ? (
                    <div style={{ opacity: 0.5 }}>No matching emails would trigger this automation.</div>
                  ) : (
                    simulationReport.expectedActions.map((act, idx) => (
                      <div key={idx} className="simulation-log-row success">
                        <span>[MATCHED]</span>
                        <span>Email: "{act.subject}" {"->"} {act.details}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )}
          </div>

          {/* Right panel: Active automations listing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <article className="automation-card">
              <h2 className="automation-card-title">
                <TerminalIcon /> Configured Automations ({workflows.length})
              </h2>
              <div className="workflow-list">
                {workflows.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', opacity: 0.5 }}>
                    No custom rules configured. Write a prompt to build one.
                  </div>
                ) : (
                  workflows.map(wf => (
                    <div key={wf.id} className="workflow-item">
                      <div className="workflow-meta">
                        <h4 className="workflow-title">{wf.name}</h4>
                        <p className="workflow-desc">{wf.description || 'Custom compiled automation.'}</p>
                      </div>
                      
                      <div className="workflow-actions-btn">
                        <label className="switch-control">
                          <input
                            type="checkbox"
                            checked={wf.enabled}
                            onChange={() => handleToggle(wf.id, wf.enabled)}
                          />
                          <span className="switch-slider"></span>
                        </label>
                        <button
                          type="button"
                          className="automation-btn automation-btn-danger"
                          style={{ padding: '0.4rem' }}
                          onClick={() => handleDelete(wf.id)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </article>

            {/* Quick Tips Box */}
            <article className="automation-card" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(0,0,0,0))' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--automation-accent)', textTransform: 'uppercase' }}>
                💡 Pro-Tip Sandbox
              </span>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--automation-text-secondary)', lineHeight: 1.5 }}>
                EmailFlow AI operates on a <strong>hybrid rules pipeline</strong>. Compiling is run once using Groq, and evaluations are processed deterministically inside background email syncs. This is incredibly cost-efficient and provides zero latency response.
              </p>
            </article>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <article className="automation-card">
          <h2 className="automation-card-title">
            <HistoryIcon /> Rules Execution Runs Log
          </h2>
          <div className="stack-list">
            {runs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', opacity: 0.5 }}>
                No active execution runs recorded. New runs trigger automatically on email sync matches.
              </div>
            ) : (
              runs.map(run => (
                <div key={run.id} style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--automation-border)', borderRadius: '12px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <span className={`run-badge ${run.executionStatus}`}>
                        {run.executionStatus}
                      </span>
                      <strong style={{ marginLeft: '0.8rem', fontSize: '0.95rem', color: '#fff' }}>
                        {run.workflowName}
                      </strong>
                    </div>
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                  
                  <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: 'var(--automation-text-secondary)' }}>
                    Trigger details: Email "{run.triggerPayload?.subject || 'N/A'}"
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem' }}>
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>Run ID: {run.id}</span>
                    <button
                      className="button button-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    >
                      {expandedRunId === run.id ? 'Hide Execution Logs' : 'View Execution Logs'}
                    </button>
                  </div>

                  {expandedRunId === run.id && (
                    <div className="run-logs-panel">
                      {run.logs && Array.isArray(run.logs) ? (
                        run.logs.map((logLine, idx) => (
                          <div key={idx} style={{ paddingBottom: '0.2rem' }}>
                            {logLine}
                          </div>
                        ))
                      ) : (
                        <div>No logs recorded.</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </article>
      )}
    </div>
  );
};

export default AutomationPage;
