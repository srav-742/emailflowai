import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import './OmnichannelPage.css';

const MOCK_SENDERS = [
  { name: 'Sarah (CEO)', id: 'sarah.ceo@emailflow.com', role: 'ceo' },
  { name: 'Recruiting Team (Deloitte)', id: 'careers@deloitte.com', role: 'recruiting' },
  { name: 'Database Monitor', id: 'alerts@ops.emailflow.com', role: 'ops' },
  { name: 'Customer Support Escalation', id: 'billing@stripe.com', role: 'finance' }
];

export default function OmnichannelPage() {
  const [activeTab, setActiveTab] = useState('inbox'); // 'inbox', 'router', 'connections'
  const [channels, setChannels] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedChannelFilter, setSelectedChannelFilter] = useState('all');
  
  // Messaging state
  const [replyText, setReplyText] = useState('');
  const [manualDestination, setManualDestination] = useState('slack');
  const [manualRecipient, setManualRecipient] = useState('');
  
  // AI Panel interactive draft
  const [aiDraftReply, setAiDraftReply] = useState('');
  const [activeAnalysis, setActiveAnalysis] = useState(null);

  // Routing Playground state
  const [rules, setRules] = useState([]);
  const [newRuleText, setNewRuleText] = useState('');
  const [compilingRule, setCompilingRule] = useState(false);
  const [testPayload, setTestPayload] = useState({
    channel: 'slack',
    senderIndex: 0,
    text: 'ALERT: Primary database connection pool exhausted. We are seeing 504 errors on Render gateways!'
  });
  const [simulationLogs, setSimulationLogs] = useState([
    '💡 Welcome to the NL Router Sandbox.',
    '💡 Configure a mock payload below and click Run Simulation Trace.'
  ]);
  const [runningSimulation, setRunningSimulation] = useState(false);

  // Connection config state
  const [connectConfig, setConnectConfig] = useState({
    channel: 'slack',
    token: '',
    signingSecret: '',
    extraId: ''
  });

  const messageEndRef = useRef(null);

  useEffect(() => {
    fetchChannels();
    fetchConversations();
    fetchRules();

    // Listen to real-time WebSockets events
    const socket = getSocket();
    if (socket) {
      console.log('📡 [Omnichannel Page] Hooking socket.io listeners');
      socket.on('omnichannel_msg', handleIncomingRealtimeMessage);
    }

    return () => {
      if (socket) {
        socket.off('omnichannel_msg', handleIncomingRealtimeMessage);
      }
    };
  }, []);

  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation.id);
    }
  }, [activeConversation]);

  useEffect(() => {
    if (messageEndRef.current) {
      messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleIncomingRealtimeMessage = (data) => {
    console.log('⚡ [Realtime Event Caught]', data);
    
    // 1. Update conversations list
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === data.conversation.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          ai_summary: data.conversation.ai_summary,
          updated_at: new Date().toISOString()
        };
        return updated.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
      }
      return [data.conversation, ...prev];
    });

    // 2. Append message if it belongs to the active thread
    if (activeConversation && activeConversation.id === data.conversation.id) {
      setMessages(prev => {
        // Prevent duplicate appending
        if (prev.some(m => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      
      // Auto update AI analysis panel
      setActiveAnalysis({
        urgency: data.message.urgency,
        sentiment: data.message.sentiment,
        recommendedReply: data.message.recommendedReply,
        actionItems: data.message.actionItems || [],
        briefing: data.conversation.ai_summary
      });
      setAiDraftReply(data.message.recommendedReply);
    }

    // 3. Append to simulation logs if active
    setSimulationLogs(prev => [
      ...prev,
      `📥 REALTIME: Caught message event on ${data.message.channel_type.toUpperCase()} from ${data.message.sender.name}`,
      ...data.routingTrace.map(log => `⚡ ${log}`)
    ]);
  };

  // ==========================================
  // API FETCH CALLS
  // ==========================================

  const fetchChannels = async () => {
    try {
      const res = await api.get('/omnichannel/channels/list');
      if (res.data?.success) setChannels(res.data.channels);
    } catch (e) {
      console.error('Failed to list integrations:', e.message);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await api.get('/omnichannel/messages/conversations');
      if (res.data?.success) {
        setConversations(res.data.conversations);
        if (res.data.conversations.length > 0 && !activeConversation) {
          setActiveConversation(res.data.conversations[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch conversations:', e.message);
    }
  };

  const fetchMessages = async (convoId) => {
    try {
      const res = await api.get(`/omnichannel/messages/thread/${convoId}`);
      if (res.data?.success) {
        setMessages(res.data.messages);
        
        // Extract AI parameters from last message if possible to populate Chief of Staff panel
        const lastMsg = res.data.messages[res.data.messages.length - 1];
        if (lastMsg) {
          const meta = lastMsg.metadata || {};
          setActiveAnalysis({
            urgency: lastMsg.channel_type === 'email' ? 90 : (meta.urgency || 45),
            sentiment: meta.sentiment || 'neutral',
            recommendedReply: meta.recommendedReply || 'Drafting AI reply...',
            actionItems: meta.actionItems || ['Review thread details.'],
            briefing: activeConversation?.ai_summary || 'Communication thread triaged.'
          });
          setAiDraftReply(meta.recommendedReply || 'Got your message, triaging right now!');
        }
      }
    } catch (e) {
      console.error('Failed to load message thread:', e.message);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await api.get('/omnichannel/routing/rules');
      if (res.data?.success) setRules(res.data.rules);
    } catch (e) {
      console.error('Failed to fetch rules:', e.message);
    }
  };

  // ==========================================
  // DISPATCH & AUTOMATION HANDLERS
  // ==========================================

  const handleManualSend = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !manualRecipient.trim()) return;

    try {
      await api.post('/omnichannel/messages/send', {
        channel_type: manualDestination,
        recipient_id: manualRecipient,
        text: replyText
      });

      // Append manually sent message visually
      const mockSentMsg = {
        id: `manual_${Date.now()}`,
        channel_type: manualDestination,
        sender: { name: 'Me (Command Center)', id: 'me' },
        content: { text: replyText },
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, mockSentMsg]);
      setReplyText('');
    } catch (err) {
      alert(`Send failed: ${err.message}`);
    }
  };

  const handleSendAIDraft = async () => {
    if (!aiDraftReply.trim()) return;

    try {
      const targetChannel = activeConversation?.primary_channel || 'slack';
      const targetRecipient = activeConversation?.unified_thread_id || 'general';

      await api.post('/omnichannel/messages/send', {
        channel_type: targetChannel,
        recipient_id: targetRecipient,
        text: aiDraftReply
      });

      const mockSentMsg = {
        id: `ai_${Date.now()}`,
        channel_type: targetChannel,
        sender: { name: 'AI Assistant (Automated)', id: 'ai' },
        content: { text: aiDraftReply },
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, mockSentMsg]);
      alert('AI response successfully sent and logged on active timeline.');
    } catch (err) {
      alert(`Draft dispatch failed: ${err.message}`);
    }
  };

  const handleCompileRule = async (e) => {
    e.preventDefault();
    if (!newRuleText.trim()) return;

    setCompilingRule(true);
    try {
      const res = await api.post('/omnichannel/routing/rules', { ruleText: newRuleText });
      if (res.data?.success) {
        setRules(prev => [...prev, res.data.rule]);
        setNewRuleText('');
        alert(`Rule compiled successfully! Added logic: ${res.data.rule.criteria}`);
      }
    } catch (err) {
      alert(`Compilation error: ${err.message}`);
    } finally {
      setCompilingRule(false);
    }
  };

  const handleResetRules = async () => {
    if (!window.confirm('Reset active policies to default?')) return;
    try {
      const res = await api.post('/omnichannel/routing/reset');
      if (res.data?.success) setRules(res.data.rules);
    } catch (e) {
      alert('Reset rules failed.');
    }
  };

  const handleRunSimulation = async () => {
    setRunningSimulation(true);
    setSimulationLogs(['🔍 Deploying simulation sandbox context...', '📡 Calling webhook simulator endpoint...']);
    
    try {
      const sender = MOCK_SENDERS[testPayload.senderIndex];
      const res = await api.post('/omnichannel/routing/test', {
        channel: testPayload.channel,
        text: testPayload.text,
        sender: sender.name
      });

      if (res.data?.success) {
        setSimulationLogs(res.data.trace);
        // Refresh conversations to catch the newly simulated message correlation
        setTimeout(fetchConversations, 800);
      }
    } catch (err) {
      setSimulationLogs(prev => [...prev, `❌ Simulation crashed: ${err.message}`]);
    } finally {
      setRunningSimulation(false);
    }
  };

  const handleConnectChannel = async (e) => {
    e.preventDefault();
    if (!connectConfig.token) {
      alert('API Access token is required.');
      return;
    }

    try {
      const res = await api.post('/omnichannel/channels/connect', {
        channel_type: connectConfig.channel,
        access_token: connectConfig.token,
        refresh_token: connectConfig.signingSecret,
        metadata: {
          external_account_id: connectConfig.extraId || 'default-gateway-id',
          sms_number: connectConfig.extraId,
          whatsapp_number: connectConfig.extraId
        }
      });

      if (res.data?.success) {
        alert('Channel connected successfully!');
        setConnectConfig({ channel: 'slack', token: '', signingSecret: '', extraId: '' });
        fetchChannels();
      }
    } catch (err) {
      alert(`Connection failed: ${err.message}`);
    }
  };

  const handleDisconnectChannel = async (channelId) => {
    if (!window.confirm('Are you sure you want to disconnect this integration?')) return;

    try {
      const res = await api.post('/omnichannel/channels/disconnect', { channel_id: channelId });
      if (res.data?.success) {
        alert('Integration disconnected.');
        fetchChannels();
      }
    } catch (err) {
      alert(`Disconnect failed: ${err.message}`);
    }
  };

  // Filter conversations based on selected channel filter
  const filteredConversations = conversations.filter(c => {
    if (selectedChannelFilter === 'all') return true;
    return c.primary_channel === selectedChannelFilter;
  });

  return (
    <div className="omni-workspace">
      {/* Premium Hero Banner */}
      <div className="omni-hero">
        <div className="omni-hero-left">
          <h1>AI Omnichannel Hub</h1>
          <p>Unify, prioritize, and orchestrate Slack, SMS, WhatsApp, Teams, Telegram, and Push channels.</p>
        </div>
        <div className="tabs-navigation-panel" style={{ display: 'flex', gap: '0.6rem', position: 'relative', zIndex: 10 }}>
          <button className={`omni-btn ${activeTab === 'inbox' ? '' : 'omni-btn-secondary'}`} onClick={() => setActiveTab('inbox')}>
            Unified Command Inbox
          </button>
          <button className={`omni-btn ${activeTab === 'router' ? '' : 'omni-btn-secondary'}`} onClick={() => setActiveTab('router')}>
            NL Rules & Sandbox
          </button>
          <button className={`omni-btn ${activeTab === 'connections' ? '' : 'omni-btn-secondary'}`} onClick={() => setActiveTab('connections')}>
            Connections & Health
          </button>
        </div>
      </div>

      {/* Tab Content 1: Command Inbox */}
      {activeTab === 'inbox' && (
        <div className="omni-grid">
          {/* Column 1: Channels Sidebar List */}
          <aside className="omni-channels-aside">
            <h3 style={{ fontSize: '0.9rem', color: 'var(--omni-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem 0' }}>
              Communication Streams
            </h3>
            
            <button className={`channel-pill-card email ${selectedChannelFilter === 'all' ? 'active' : ''}`} onClick={() => setSelectedChannelFilter('all')}>
              <div className="channel-info-left">
                <span className="channel-icon-shield email">ALL</span>
                <div className="channel-details">
                  <strong>All Channels</strong>
                  <span>Consolidated stream</span>
                </div>
              </div>
              <span className="health-status-indicator online"></span>
            </button>

            {channels.map(chan => (
              <button 
                key={chan.channel} 
                className={`channel-pill-card ${chan.channel} ${selectedChannelFilter === chan.channel ? 'active' : ''}`}
                onClick={() => setSelectedChannelFilter(chan.channel)}
              >
                <div className="channel-info-left">
                  <span className={`channel-icon-shield ${chan.channel}`}>
                    {chan.channel.substring(0, 2).toUpperCase()}
                  </span>
                  <div className="channel-details">
                    <strong style={{ textTransform: 'capitalize' }}>{chan.channel.replace('twilio-', '')}</strong>
                    <span>{chan.isConnected ? 'CONNECTED' : 'MOCK SIMULATOR'}</span>
                  </div>
                </div>
                <span className={`health-status-indicator ${chan.isConnected ? 'online' : 'simulator'}`}></span>
              </button>
            ))}
          </aside>

          {/* Column 2: Inbox & Timeline */}
          <section className="omni-inbox-container">
            <div className="omni-glass-card" style={{ flexGrow: 1 }}>
              <div className="omni-card-header">
                <h2>
                  <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }}>
                    Active Feed
                  </span>
                  Unified Timelines
                </h2>
                <div className="conversation-switcher-header">
                  {filteredConversations.length > 0 ? (
                    <select 
                      style={{ background: '#050508', border: '1px solid var(--omni-border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '8px', outline: 'none' }}
                      value={activeConversation?.id || ''}
                      onChange={(e) => {
                        const found = conversations.find(c => c.id === e.target.value);
                        if (found) setActiveConversation(found);
                      }}
                    >
                      {filteredConversations.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.primary_channel.toUpperCase()}: {c.unified_thread_id.substring(0, 16)}...
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--omni-text-muted)' }}>No Active Threads</span>
                  )}
                </div>
              </div>

              {/* Message Feed timeline */}
              <div className="omni-timeline-stream">
                {messages.length > 0 ? (
                  messages.map(msg => (
                    <div key={msg.id} className="timeline-bubble-row">
                      <div className="sender-avatar-shell">
                        <img 
                          src={msg.sender?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.sender?.name || 'EF'}`} 
                          alt="avatar" 
                        />
                      </div>
                      <div className="message-bubble-wrapper">
                        <div className="bubble-meta-header">
                          <span className="bubble-sender-name">
                            {msg.sender?.name || 'System'}
                            <span className={`channel-tag-micro ${msg.channel_type}`}>
                              {msg.channel_type.replace('twilio-', '')}
                            </span>
                          </span>
                          <span className="bubble-timestamp">
                            {new Date(msg.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="bubble-text-content">{msg.content?.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--omni-text-muted)' }}>
                    <p>Select a channel or conversation thread to load messages.</p>
                  </div>
                )}
                <div ref={messageEndRef} />
              </div>

              {/* Quick sending command pane */}
              <form onSubmit={handleManualSend} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '1rem', display: 'flex', gap: '0.8rem', flexDirection: 'column' }}>
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Escalate Out:</span>
                  <select 
                    style={{ background: '#050508', border: '1px solid var(--omni-border)', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '8px' }}
                    value={manualDestination}
                    onChange={(e) => setManualDestination(e.target.value)}
                  >
                    <option value="slack">Slack DM</option>
                    <option value="twilio-sms">Twilio SMS</option>
                    <option value="whatsapp">WhatsApp Business</option>
                    <option value="telegram">Telegram DM</option>
                    <option value="teams">Teams Alert</option>
                  </select>

                  <input 
                    type="text" 
                    placeholder="Recipient Number/Handle (e.g. +14155552671)"
                    style={{ background: '#050508', border: '1px solid var(--omni-border)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '8px', flexGrow: 1 }}
                    value={manualRecipient}
                    onChange={(e) => setManualRecipient(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.8rem' }}>
                  <input 
                    type="text" 
                    placeholder="Type a manual response/escalation..."
                    style={{ background: '#050508', border: '1px solid var(--omni-border)', color: '#fff', padding: '0.7rem 1rem', borderRadius: '10px', flexGrow: 1, outline: 'none' }}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                  />
                  <button type="submit" className="omni-btn">Dispatch Outbound</button>
                </div>
              </form>
            </div>
          </section>

          {/* Column 3: AI Prioritization dial & smart briefings */}
          <aside className="omni-insights-aside">
            <div className="omni-glass-card urgency-meter-card">
              <span className="eyebrow" style={{ fontSize: '0.7rem', color: 'var(--omni-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                AI Urgency Assessment
              </span>
              
              <div className="meter-circle-shell">
                <span className={`meter-radial-value ${activeAnalysis?.urgency >= 80 ? 'high' : activeAnalysis?.urgency >= 40 ? 'medium' : 'low'}`}>
                  {activeAnalysis?.urgency || '--'}
                </span>
              </div>

              {activeAnalysis && (
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <span className={`sentiment-label-badge ${activeAnalysis.sentiment}`}>
                    Sentiment: {activeAnalysis.sentiment}
                  </span>
                  <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--omni-text-secondary)', margin: '0.4rem 0 0 0' }}>
                    "{activeAnalysis.briefing}"
                  </p>
                </div>
              )}
            </div>

            {/* Extracted Action boundaries */}
            <div className="omni-glass-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.6rem' }}>
                Cross-Channel Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {activeAnalysis?.actionItems && activeAnalysis.actionItems.length > 0 ? (
                  activeAnalysis.actionItems.map((act, i) => (
                    <div key={i} className="action-chip-badge">
                      ⚠️ {act}
                    </div>
                  ))
                ) : (
                  <span style={{ color: 'var(--omni-text-muted)', fontSize: '0.8rem' }}>No pending action items extracted.</span>
                )}
              </div>
            </div>

            {/* AI Auto-Responder Draft box */}
            <div className="omni-glass-card">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.6rem' }}>
                Interactive Auto-Responder
              </h3>
              <div className="auto-reply-console">
                <textarea 
                  className="auto-reply-text"
                  value={aiDraftReply}
                  onChange={(e) => setAiDraftReply(e.target.value)}
                  placeholder="AI is preparing response recommendation..."
                />
              </div>
              <button 
                className="omni-btn" 
                onClick={handleSendAIDraft}
                disabled={!aiDraftReply.trim()}
              >
                ⚡ Approve & Dispatch Reply
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Tab Content 2: Rules & Routing playground */}
      {activeTab === 'router' && (
        <div className="omni-grid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
          {/* Rules Builder */}
          <div className="omni-glass-card">
            <h2>NL Routing Rule Compiler</h2>
            <p style={{ color: 'var(--omni-text-secondary)', fontSize: '0.88rem' }}>
              Define routing rules in plain English. The Groq engine compiles them to structured execution filters.
            </p>

            <form onSubmit={handleCompileRule} style={{ display: 'flex', gap: '0.8rem', flexDirection: 'column' }}>
              <input 
                type="text" 
                className="connect-input-field"
                placeholder="Example: If support SLA risk is high, escalate to Twilio SMS and Send Push..."
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                style={{ padding: '0.8rem' }}
              />
              <button type="submit" className="omni-btn" disabled={compilingRule || !newRuleText.trim()}>
                {compilingRule ? 'Compiling AI rule...' : '⚡ Compile NL Statement'}
              </button>
            </form>

            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.6rem', marginBottom: '0.8rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Active Automation Policies</h3>
                <button className="omni-btn omni-btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }} onClick={handleResetRules}>
                  Reset Defaults
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {rules.map(rule => (
                  <div key={rule.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.8rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#fff' }}>{rule.name}</strong>
                      <span style={{ fontSize: '0.72rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>
                        {rule.actions.join(', ')}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--omni-text-secondary)', margin: '0.3rem 0' }}>{rule.description}</p>
                    <code style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'monospace' }}>Filter: {rule.criteria}</code>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sandbox Trace Logger */}
          <div className="omni-glass-card routing-sandbox">
            <h2>Simulation Sandbox</h2>
            <p style={{ color: 'var(--omni-text-secondary)', fontSize: '0.88rem' }}>
              Test and run custom simulated payloads through the complete Omnichannel routing, prioritization, and synchronization pipelines.
            </p>

            <div className="routing-input-row">
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.3rem' }}>Mock Sender:</label>
                <select 
                  className="connect-input-field" 
                  style={{ width: '100%' }}
                  value={testPayload.senderIndex}
                  onChange={(e) => setTestPayload(prev => ({ ...prev, senderIndex: parseInt(e.target.value) }))}
                >
                  {MOCK_SENDERS.map((s, i) => (
                    <option key={i} value={i}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.3rem' }}>Inbound Channel:</label>
                <select 
                  className="connect-input-field" 
                  style={{ width: '100%' }}
                  value={testPayload.channel}
                  onChange={(e) => setTestPayload(prev => ({ ...prev, channel: e.target.value }))}
                >
                  <option value="slack">Slack Message Event</option>
                  <option value="twilio-sms">Twilio SMS Gateway</option>
                  <option value="whatsapp">Twilio WhatsApp Message</option>
                  <option value="telegram">Telegram Command Bot</option>
                  <option value="teams">Microsoft Teams hook</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.3rem' }}>Message Text:</label>
              <textarea 
                className="routing-textarea"
                value={testPayload.text}
                onChange={(e) => setTestPayload(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Alert text content..."
              />
            </div>

            <button className="omni-btn" onClick={handleRunSimulation} disabled={runningSimulation || !testPayload.text.trim()}>
              {runningSimulation ? 'Running sandbox simulation...' : '⚡ Trigger Inbound Simulation Trace'}
            </button>

            <div>
              <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>
                Sandbox Terminal Log Output:
              </span>
              <div className="sandbox-execution-terminal">
                {simulationLogs.map((log, i) => (
                  <div 
                    key={i} 
                    className={`sandbox-trace-line ${log.includes('✅') || log.includes('success') ? 'success' : log.includes('🚨') || log.includes('warning') ? 'warning' : log.includes('❌') ? 'error' : ''}`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: Integrations & Connections */}
      {activeTab === 'connections' && (
        <div className="omni-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
          {/* Integration List */}
          <div className="omni-glass-card">
            <h2>API Integrations Manager</h2>
            <p style={{ color: 'var(--omni-text-secondary)', fontSize: '0.88rem' }}>
              Connect your communication platforms securely. Credentials are encrypted in transit and stored utilizing AES-256-GCM.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {channels.map(chan => (
                <div 
                  key={chan.channel} 
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '1.2rem', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span className={`channel-icon-shield ${chan.channel}`} style={{ width: '45px', height: '45px', fontSize: '1.1rem' }}>
                      {chan.channel.substring(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong style={{ display: 'block', textTransform: 'capitalize', fontSize: '1.02rem', color: '#fff' }}>
                        {chan.channel.replace('twilio-', '')} API Gateway
                      </strong>
                      <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.75rem', color: 'var(--omni-text-secondary)', marginTop: '0.15rem' }}>
                        <span>Avg Latency: <strong>{chan.latency}</strong></span>
                        <span>Delivery rate: <strong>{chan.successRate}</strong></span>
                        <span>Limits: <strong>{chan.rateLimit}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.72rem', background: chan.isConnected ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.12)', color: chan.isConnected ? '#10b981' : '#f59e0b', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                      {chan.isConnected ? 'CONNECTED' : 'SIMULATOR ACTIVE'}
                    </span>
                    {chan.isConnected && (
                      <button className="omni-btn omni-btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => handleDisconnectChannel(chan.id)}>
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connect Gateway Credentials Form */}
          <div className="omni-glass-card">
            <h2>Add Secure Connection</h2>
            <p style={{ color: 'var(--omni-text-secondary)', fontSize: '0.88rem', marginBottom: '0.8rem' }}>
              Register real API credentials to run active, out-of-sandbox provider webhooks.
            </p>

            <form onSubmit={handleConnectChannel} className="connect-input-stack">
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.25rem' }}>Target Provider:</label>
                <select 
                  className="connect-input-field" 
                  style={{ width: '100%' }}
                  value={connectConfig.channel}
                  onChange={(e) => setConnectConfig(prev => ({ ...prev, channel: e.target.value }))}
                >
                  <option value="slack">Slack Workspace (OAuth)</option>
                  <option value="twilio-sms">Twilio SMS (API Key)</option>
                  <option value="whatsapp">WhatsApp Business (Twilio)</option>
                  <option value="teams">Microsoft Teams Webhook</option>
                  <option value="telegram">Telegram Bot Token</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.25rem' }}>
                  {connectConfig.channel === 'slack' ? 'Bot User OAuth Token:' : 'Account SID / API Token:'}
                </label>
                <input 
                  type="password" 
                  className="connect-input-field" 
                  style={{ width: '100%' }}
                  placeholder={connectConfig.channel === 'slack' ? 'xoxb-...' : 'AC...'}
                  value={connectConfig.token}
                  onChange={(e) => setConnectConfig(prev => ({ ...prev, token: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.25rem' }}>
                  {connectConfig.channel === 'slack' ? 'Signing Secret (Optional):' : 'Auth Token / Secret key:'}
                </label>
                <input 
                  type="password" 
                  className="connect-input-field" 
                  style={{ width: '100%' }}
                  placeholder="Secret key..."
                  value={connectConfig.signingSecret}
                  onChange={(e) => setConnectConfig(prev => ({ ...prev, signingSecret: e.target.value }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--omni-text-secondary)', marginBottom: '0.25rem' }}>
                  {connectConfig.channel.includes('twilio') || connectConfig.channel.includes('whatsapp') ? 'Twilio Phone Number:' : 'External account label (Optional):'}
                </label>
                <input 
                  type="text" 
                  className="connect-input-field" 
                  style={{ width: '100%' }}
                  placeholder="+14155552671"
                  value={connectConfig.extraId}
                  onChange={(e) => setConnectConfig(prev => ({ ...prev, extraId: e.target.value }))}
                />
              </div>

              <button type="submit" className="omni-btn" style={{ marginTop: '0.5rem' }}>
                🔒 Encrypt & Connect Platform
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
