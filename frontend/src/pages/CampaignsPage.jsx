import { useState, useEffect } from 'react';
import { campaignAPI } from '../services/api';
import './CampaignsPage.css';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [timeline, setTimeline] = useState([]);
  
  // Creation States
  const [isCreating, setIsCreating] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignType, setNewCampaignType] = useState('sales');
  const [steps, setSteps] = useState([
    { step_order: 1, delay_hours: 0, subject: 'Outreach Subject A', body: 'Hi {{firstName}},\n\nI noticed your work at {{company}} as a {{role}}.\n\nLet\'s connect!\n\nBest,\n[Your Name]' }
  ]);

  // AI Assistant Modal
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Contact Upload States
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [isContactsOpen, setIsContactsOpen] = useState(false);
  const [contactsText, setContactsText] = useState('');
  const [campaignContactsList, setCampaignContactsList] = useState([]);

  // Active Tab
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'analytics'

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campRes, polyRes] = await Promise.all([
        campaignAPI.list(),
        campaignAPI.getAnalytics()
      ]);
      setCampaigns(campRes.data.campaigns || []);
      setAnalytics(polyRes.data.stats || null);
      setTimeline(polyRes.data.timeline || []);
      setError(null);
    } catch (err) {
      setError('Failed to fetch campaign dashboard records.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartCampaign = async (id) => {
    try {
      await campaignAPI.start(id);
      showToast('Campaign successfully activated!');
      fetchData();
    } catch (err) {
      setError('Could not activate campaign.');
    }
  };

  const handlePauseCampaign = async (id) => {
    try {
      await campaignAPI.pause(id);
      showToast('Campaign paused.');
      fetchData();
    } catch (err) {
      setError('Could not pause campaign.');
    }
  };

  // AI Sequence Drip copy creator
  const triggerAICreator = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setError(null);
    try {
      const res = await campaignAPI.generateAI(aiPrompt);
      if (res.data.success) {
        setNewCampaignName(res.data.campaignName);
        setNewCampaignType(res.data.campaignType);
        
        // Map steps
        const mappedSteps = res.data.steps.map(s => ({
          step_order: s.step_order,
          delay_hours: s.delay_hours,
          subject: s.subject,
          body: s.body,
          conditions: s.conditions || { openTrigger: false, linkTrigger: false }
        }));
        setSteps(mappedSteps);
        
        setIsAIModalOpen(false);
        setIsCreating(true);
        showToast('AI Drip Sequence successfully drafted!');
      }
    } catch (err) {
      setError('AI copy generation is currently throttled. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  // Create Campaign
  const handleSaveCampaign = async () => {
    if (!newCampaignName.trim()) {
      setError('Campaign name is required.');
      return;
    }
    setLoading(true);
    try {
      await campaignAPI.create({
        name: newCampaignName,
        campaignType: newCampaignType,
        steps,
        settings: { sendWindow: 'business_hours' }
      });
      setIsCreating(false);
      setNewCampaignName('');
      setSteps([{ step_order: 1, delay_hours: 0, subject: '', body: '' }]);
      showToast('Campaign successfully saved!');
      fetchData();
    } catch (err) {
      setError('Failed to create campaign sequence.');
    } finally {
      setLoading(false);
    }
  };

  // Contacts upload CSV parser
  const handleImportContacts = async () => {
    if (!contactsText.trim() || !selectedCampaign) return;
    setLoading(true);
    try {
      const lines = contactsText.split('\n').filter(l => l.trim().includes('@'));
      const list = lines.map(line => {
        const parts = line.split(',');
        return {
          email: parts[0]?.trim() || '',
          firstName: parts[1]?.trim() || '',
          company: parts[2]?.trim() || '',
          role: parts[3]?.trim() || ''
        };
      });

      const res = await campaignAPI.importContacts(selectedCampaign.id, list);
      showToast(res.data.message || 'Contacts imported successfully!');
      setContactsText('');
      setIsContactsOpen(false);
      fetchData();
    } catch (err) {
      setError('Failed to upload contacts list.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenContacts = async (camp) => {
    setSelectedCampaign(camp);
    setIsContactsOpen(true);
    try {
      const res = await campaignAPI.getContacts(camp.id);
      setCampaignContactsList(res.data.contacts || []);
    } catch (e) {
      setCampaignContactsList([]);
    }
  };

  const showToast = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const addSequenceStep = () => {
    setSteps([
      ...steps,
      {
        step_order: steps.length + 1,
        delay_hours: 48,
        subject: `Follow up step ${steps.length + 1}`,
        body: 'Hi {{firstName}},\n\nFollowing up on my previous message. Let me know if we can sync up.\n\nBest,\n[Your Name]',
        conditions: { openTrigger: false, linkTrigger: false }
      }
    ]);
  };

  const updateStepField = (index, field, value) => {
    const next = [...steps];
    next[index][field] = value;
    setSteps(next);
  };

  const updateStepCondition = (index, conditionField, value) => {
    const next = [...steps];
    if (!next[index].conditions) next[index].conditions = { openTrigger: false, linkTrigger: false };
    next[index].conditions[conditionField] = value;
    setSteps(next);
  };

  const removeSequenceStep = (index) => {
    const next = steps.filter((_, i) => i !== index).map((s, idx) => ({
      ...s,
      step_order: idx + 1
    }));
    setSteps(next);
  };

  const getConversionRate = () => {
    if (!analytics || !analytics.sent) return '0%';
    const rate = (analytics.replied / analytics.sent) * 100;
    return `${rate.toFixed(1)}%`;
  };

  return (
    <div className="campaigns-workspace animate-fade-in">
      {successMsg && (
        <div className="ef-toast-notification">
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="ef-error-banner">
          <span>⚠️ {error}</span>
          <button className="banner-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Primary Visual Tabs */}
      <div className="workspace-header-actions">
        <div className="tab-control-segment">
          <button 
            className={`tab-pill ${activeTab === 'campaigns' ? 'active' : ''}`}
            onClick={() => setActiveTab('campaigns')}
          >
            Drip Campaigns
          </button>
          <button 
            className={`tab-pill ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Telemetry & Analytics
          </button>
        </div>

        <div className="primary-campaign-triggers">
          <button className="btn-ai-glass" onClick={() => setIsAIModalOpen(true)}>
            ✨ Draft with AI
          </button>
          <button className="btn-primary-gradient" onClick={() => setIsCreating(true)}>
            ＋ Create Campaign
          </button>
        </div>
      </div>

      {activeTab === 'campaigns' && (
        <>
          {/* Aggregated Stats Metrics Banner */}
          <div className="stats-glass-grid">
            <div className="metric-glass-card">
              <span className="metric-label">Sequences Sent</span>
              <h2 className="metric-val">{analytics?.sent || 0}</h2>
              <span className="metric-sub">Outbound outreach sends</span>
            </div>
            <div className="metric-glass-card">
              <span className="metric-label">Open Rate</span>
              <h2 className="metric-val">
                {analytics?.sent ? `${((analytics.opened / analytics.sent) * 100).toFixed(1)}%` : '0%'}
              </h2>
              <span className="metric-sub">{analytics?.opened || 0} opens tracked</span>
            </div>
            <div className="metric-glass-card">
              <span className="metric-label">Click Rate</span>
              <h2 className="metric-val">
                {analytics?.sent ? `${((analytics.clicked / analytics.sent) * 100).toFixed(1)}%` : '0%'}
              </h2>
              <span className="metric-sub">{analytics?.clicked || 0} link clicks</span>
            </div>
            <div className="metric-glass-card highlighting">
              <span className="metric-label text-accent">Reply Rate</span>
              <h2 className="metric-val text-accent">{analytics?.sent ? `${((analytics.replied / analytics.sent) * 100).toFixed(1)}%` : '0%'}</h2>
              <span className="metric-sub text-accent">{analytics?.replied || 0} replies registered</span>
            </div>
          </div>

          {/* Create Campaign Panel */}
          {isCreating && (
            <div className="creation-overlay animate-slide-up">
              <div className="creation-glass-modal">
                <div className="creation-modal-header">
                  <h2>Create Drip Sequence</h2>
                  <button className="btn-close" onClick={() => setIsCreating(false)}>×</button>
                </div>

                <div className="modal-scroll-pane">
                  <div className="form-group-row">
                    <div className="form-field flex-2">
                      <label>Campaign Name</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Sales Outbound Outreach Q2" 
                        value={newCampaignName}
                        onChange={(e) => setNewCampaignName(e.target.value)}
                      />
                    </div>
                    <div className="form-field flex-1">
                      <label>Workflow Type</label>
                      <select 
                        value={newCampaignType}
                        onChange={(e) => setNewCampaignType(e.target.value)}
                      >
                        <option value="sales">Sales Automation</option>
                        <option value="hiring">Hiring / Recruitment</option>
                        <option value="onboarding">Customer Onboarding</option>
                        <option value="nurturing">Executive Relationship</option>
                      </select>
                    </div>
                  </div>

                  <hr className="divider-glow" />

                  <h3>Sequence Flowchart & Visual Steps</h3>
                  
                  {/* Interactive Sequence Steps Visual Builder */}
                  <div className="visual-flow-builder">
                    {steps.map((step, idx) => (
                      <div key={idx} className="flow-step-card animate-scale-in">
                        <div className="step-badge">Step {step.step_order}</div>

                        <div className="step-form-grid">
                          <div className="step-field flex-1">
                            <label>Delay (Hours)</label>
                            <input 
                              type="number" 
                              min="0"
                              placeholder="0 for instant" 
                              value={step.delay_hours}
                              onChange={(e) => updateStepField(idx, 'delay_hours', parseInt(e.target.value || '0', 10))}
                            />
                            <span className="delay-helper-text">
                              {step.delay_hours === 0 ? 'Fires instantly on upload' : `Fires after ${step.delay_hours} hours`}
                            </span>
                          </div>

                          <div className="step-field flex-3">
                            <label>Email Subject</label>
                            <input 
                              type="text" 
                              placeholder="Outreach subject line..." 
                              value={step.subject}
                              onChange={(e) => updateStepField(idx, 'subject', e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="step-field text-area-field">
                          <label>Email Template Body</label>
                          <textarea 
                            rows="6"
                            placeholder="Supports variables: {{firstName}}, {{company}}, {{role}}..."
                            value={step.body}
                            onChange={(e) => updateStepField(idx, 'body', e.target.value)}
                          />
                        </div>

                        {idx > 0 && (
                          <div className="conditional-trigger-section">
                            <span className="trigger-heading">⚙️ Branching Triggers (Wait Conditions)</span>
                            <div className="triggers-row">
                              <label className="checkbox-lockup">
                                <input 
                                  type="checkbox"
                                  checked={step.conditions?.openTrigger || false}
                                  onChange={(e) => updateStepCondition(idx, 'openTrigger', e.target.checked)}
                                />
                                Only send if prior step was opened
                              </label>
                              <label className="checkbox-lockup">
                                <input 
                                  type="checkbox"
                                  checked={step.conditions?.linkTrigger || false}
                                  onChange={(e) => updateStepCondition(idx, 'linkTrigger', e.target.checked)}
                                />
                                Only send if prior step link clicked
                              </label>
                            </div>
                          </div>
                        )}

                        <div className="step-card-footer">
                          <button className="btn-danger-ghost" onClick={() => removeSequenceStep(idx)}>
                            🗑️ Delete Step
                          </button>
                        </div>
                      </div>
                    ))}

                    <button className="btn-add-step-dashed" onClick={addSequenceStep}>
                      ＋ Add Automated Follow-up Step
                    </button>
                  </div>
                </div>

                <div className="creation-modal-footer">
                  <button className="btn-ghost" onClick={() => setIsCreating(false)}>Cancel</button>
                  <button className="btn-primary-gradient" onClick={handleSaveCampaign} disabled={loading}>
                    {loading ? 'Registering...' : '💾 Register & Save Campaign'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Campaigns Cards list */}
          <div className="campaigns-deck">
            {campaigns.length === 0 ? (
              <div className="empty-state-glass">
                <span className="icon-badge">🎯</span>
                <h3>No Drip Campaigns Found</h3>
                <p>Use the visual builder or prompt the Chief of Staff AI writer to construct your first outbound relationship flow!</p>
              </div>
            ) : (
              campaigns.map((camp) => (
                <div key={camp.id} className="campaign-glass-card animate-fade-in">
                  <div className="camp-card-header">
                    <div>
                      <span className="type-tag">{camp.campaign_type.toUpperCase()}</span>
                      <h3>{camp.name}</h3>
                    </div>
                    <span className={`status-pill ${camp.status}`}>
                      {camp.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="camp-card-body">
                    <div className="grid-telemetry">
                      <div>
                        <span className="telemetry-label">Active Leads</span>
                        <span className="telemetry-val">{camp.active_count}</span>
                      </div>
                      <div>
                        <span className="telemetry-label">Replies</span>
                        <span className="telemetry-val text-accent">{camp.reply_count}</span>
                      </div>
                      <div>
                        <span className="telemetry-label">Total Uploads</span>
                        <span className="telemetry-val">{camp.contact_count}</span>
                      </div>
                    </div>
                  </div>

                  <div className="camp-card-actions">
                    <button className="btn-glass-secondary" onClick={() => handleOpenContacts(camp)}>
                      👥 Leads List ({camp.contact_count})
                    </button>

                    {camp.status === 'active' ? (
                      <button className="btn-danger-solid" onClick={() => handlePauseCampaign(camp.id)}>
                        ⏸️ Pause
                      </button>
                    ) : (
                      <button className="btn-success-solid" onClick={() => handleStartCampaign(camp.id)}>
                        ▶️ Start Campaign
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Analytics Tab Screen */}
      {activeTab === 'analytics' && (
        <div className="analytics-tab-pane animate-fade-in">
          <div className="timeline-telemetry-header">
            <h3>Campaign Chronological Timeline Sends</h3>
            <p>Monitors hourly telemetry events (opens, replies, conversions) logged inside our outbound queue.</p>
          </div>

          <div className="analytics-summary-strip">
            <div className="strip-card">
              <h3>{getConversionRate()}</h3>
              <p>Overall Conversion Rate</p>
            </div>
            <div className="strip-card">
              <h3>{analytics?.bounced || 0}</h3>
              <p>Bounces Enforced</p>
            </div>
            <div className="strip-card">
              <h3>{analytics?.unsubscribed || 0}</h3>
              <p>Unsubscribed suppression lists</p>
            </div>
          </div>

          <div className="timeline-grid-list">
            <div className="card-glass-table">
              <div className="table-header">
                <span>Timeline Date</span>
                <span>Sent</span>
                <span>Opened</span>
                <span>Replied</span>
              </div>
              {timeline.length === 0 ? (
                <div className="table-empty">No daily telemetry events logged over the last 14 days.</div>
              ) : (
                timeline.map((day, idx) => (
                  <div key={idx} className="table-row">
                    <span>{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span>{day.sent}</span>
                    <span>{day.opened}</span>
                    <span className="text-accent">{day.replied}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Campaign Generator Modal */}
      {isAIModalOpen && (
        <div className="creation-overlay animate-scale-in">
          <div className="creation-glass-modal max-w-sm">
            <div className="creation-modal-header">
              <h2>✨ AI Drip Sequence Designer</h2>
              <button className="btn-close" onClick={() => setIsAIModalOpen(false)}>×</button>
            </div>
            <div className="modal-body-padding">
              <p className="modal-explainer">Describe your target goal, audience, and onboarding requirements. The Chief of Staff LLM will build an optimized email layout sequence for you.</p>
              
              <textarea 
                rows="5"
                placeholder="e.g., Generate a 3-step SaaS customer onboarding sequence for users who register for a professional subscription. Keep it friendly and concise."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
            </div>
            <div className="creation-modal-footer">
              <button className="btn-ghost" onClick={() => setIsAIModalOpen(false)}>Cancel</button>
              <button className="btn-primary-gradient" onClick={triggerAICreator} disabled={aiGenerating || !aiPrompt.trim()}>
                {aiGenerating ? 'Designing Campaign Flow...' : '✨ Design sequence flow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts List & Import Modal */}
      {isContactsOpen && selectedCampaign && (
        <div className="creation-overlay animate-scale-in">
          <div className="creation-glass-modal large">
            <div className="creation-modal-header">
              <h2>Leads Management: {selectedCampaign.name}</h2>
              <button className="btn-close" onClick={() => setIsContactsOpen(false)}>×</button>
            </div>

            <div className="contacts-modal-layout">
              <div className="import-leads-pane">
                <h3>📥 Import New Leads</h3>
                <p className="desc">Paste comma-separated leads (Email, Name, Company, Role). One contact per line.</p>
                <textarea 
                  rows="7"
                  placeholder="sravya@emailflowai.com, Sravya, EmailFlow AI, CTO&#10;lead@growth.com, John, GrowthCorp, Founder"
                  value={contactsText}
                  onChange={(e) => setContactsText(e.target.value)}
                />
                <button className="btn-primary-gradient full-width margin-top" onClick={handleImportContacts} disabled={loading || !contactsText.trim()}>
                  {loading ? 'Processing Upload...' : '＋ Import CSV Leads'}
                </button>
              </div>

              <div className="leads-list-pane">
                <h3>👥 Registered Leads ({campaignContactsList.length})</h3>
                <div className="leads-scroll-table">
                  <div className="table-header">
                    <span>Email</span>
                    <span>Details</span>
                    <span>Status</span>
                  </div>
                  {campaignContactsList.length === 0 ? (
                    <div className="table-empty">No leads imported. Paste CSV records on the left panel to import.</div>
                  ) : (
                    campaignContactsList.map((lead) => (
                      <div key={lead.id} className="table-row">
                        <span className="email-lbl">{lead.email}</span>
                        <span className="details-lbl">
                          {lead.metadata?.firstName || 'Lead'} • {lead.metadata?.company || 'Company'}
                        </span>
                        <span className={`status-indicator ${lead.status}`}>
                          {lead.status.toUpperCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
