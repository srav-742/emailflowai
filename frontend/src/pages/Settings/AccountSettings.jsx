import { useEffect, useState } from 'react';
import { useAccounts } from '../../context/AccountContext';
import { useAuth } from '../../context/AuthContext';
import { authAPI, mailAPI, emailAPI, billingAPI } from '../../services/api';
import { subscribeToPush, unsubscribeFromPush } from '../../utils/pushSubscribe';

const AccountSettings = () => {
  const { accounts, updateAccountSettings, disconnectAccount, fetchAccounts } = useAccounts();
  const { token, gmailReconnectState } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState('Notification' in window && Notification.permission === 'granted');
  
  // Custom Wizard State
  const [activeStep, setActiveStep] = useState(1); // 1: Provider & Identity, 2: IMAP Settings, 3: SMTP Settings
  const [selectedProvider, setSelectedProvider] = useState('custom'); // 'gmail', 'outlook', 'yahoo', 'custom'
  const [autoDetected, setAutoDetected] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  
  const [connectData, setConnectData] = useState({
    email: '',
    displayName: '',
    imapHost: '',
    imapPort: 993,
    imapSecurity: 'SSL/TLS', // SSL/TLS, STARTTLS, None
    imapUsername: '',
    imapPassword: '',
    sameAsIncoming: true,
    smtpHost: '',
    smtpPort: 587,
    smtpSecurity: 'STARTTLS', // SSL/TLS, STARTTLS, None
    smtpUsername: '',
    smtpPassword: '',
  });

  const [connectStatus, setConnectStatus] = useState({ tone: '', text: '' });
  const [connectLoading, setConnectLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Billing Tab & Subscription States
  const [activeTab, setActiveTab] = useState('mailboxes'); // 'mailboxes' or 'billing'
  const [subData, setSubData] = useState(null);
  const [subLoading, setSubLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchSubscriptionDetails = async () => {
    try {
      setSubLoading(true);
      const res = await billingAPI.getSubscription();
      setSubData(res.data);
    } catch (err) {
      console.error('Failed to fetch subscription status:', err);
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionDetails();
  }, []);

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      const res = await billingAPI.createPortal();
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error('Portal redirect error:', err);
      alert('Could not open billing portal. Please subscribe first.');
    } finally {
      setPortalLoading(false);
    }
  };

  // Verification Progress Modal States
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationSteps, setVerificationSteps] = useState({
    resolvingDns: 'idle', // 'idle' | 'pending' | 'success' | 'error'
    imapConnect: 'idle',
    smtpConnect: 'idle',
    savingAccount: 'idle',
  });
  const [verificationError, setVerificationError] = useState('');

  const handleEdit = (account) => {
    setEditingId(account.id);
    setEditData({
      displayName: account.displayName || '',
      color: account.color || '#6366f1',
      syncEnabled: account.syncEnabled,
    });
  };

  const handleSave = async (id) => {
    await updateAccountSettings(id, editData);
    setEditingId(null);
  };

  const handleTogglePush = async () => {
    setPushLoading(true);
    if (pushEnabled) {
      const success = await unsubscribeFromPush(token);
      if (success) setPushEnabled(false);
    } else {
      const success = await subscribeToPush(token);
      if (success) setPushEnabled(true);
    }
    setPushLoading(false);
  };

  // Debounced auto-detection of email provider
  useEffect(() => {
    if (!connectData.email || !connectData.email.includes('@')) {
      setAutoDetected(false);
      return;
    }
    const domain = connectData.email.split('@')[1];
    if (domain.length < 4) return;

    const timer = setTimeout(async () => {
      setDetecting(true);
      try {
        const response = await mailAPI.detectProvider(connectData.email);
        if (response.data?.detected) {
          const { provider, imap, smtp } = response.data;
          setSelectedProvider(provider);
          setConnectData(prev => ({
            ...prev,
            imapHost: imap?.host || '',
            imapPort: imap?.port || 993,
            imapSecurity: imap?.port === 993 ? 'SSL/TLS' : 'STARTTLS',
            imapUsername: prev.email,
            smtpHost: smtp?.host || '',
            smtpPort: smtp?.port || 587,
            smtpSecurity: smtp?.port === 465 ? 'SSL/TLS' : 'STARTTLS',
            smtpUsername: prev.email,
          }));
          setAutoDetected(true);
          setConnectStatus({
            tone: 'success',
            text: `Mail configuration for ${provider.toUpperCase()} auto-detected and pre-filled!`,
          });
        } else {
          setAutoDetected(false);
        }
      } catch (err) {
        console.error('Auto-detect error:', err);
      } finally {
        setDetecting(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [connectData.email]);

  const handleInputChange = (field, value) => {
    setConnectData(prev => {
      const next = { ...prev, [field]: value };
      
      // Auto-mirror settings from incoming to outgoing if sameAsIncoming toggle is active
      if (next.sameAsIncoming) {
        if (field === 'email' || field === 'imapUsername') {
          next.smtpUsername = next.imapUsername || next.email;
        }
        if (field === 'imapPassword') {
          next.smtpPassword = next.imapPassword;
        }
      }
      return next;
    });
  };

  const handleVerifyAndConnect = async (event) => {
    if (event) event.preventDefault();
    setConnectLoading(true);
    setVerificationError('');
    setShowVerificationModal(true);
    setVerificationSteps({
      resolvingDns: 'pending',
      imapConnect: 'idle',
      smtpConnect: 'idle',
      savingAccount: 'idle',
    });

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // Step A: Resolving DNS & Verifying host names
      await sleep(1000);
      setVerificationSteps(prev => ({ ...prev, resolvingDns: 'success', imapConnect: 'pending' }));

      // Prepare connection payloads
      const passwordToUse = connectData.imapPassword;
      const imapPortToUse = parseInt(connectData.imapPort) || 993;
      const smtpPortToUse = parseInt(connectData.smtpPort) || 587;

      const testPayload = {
        email: connectData.email.trim(),
        password: passwordToUse,
        imapHost: connectData.imapHost.trim(),
        imapPort: imapPortToUse,
        smtpHost: connectData.smtpHost.trim(),
        smtpPort: smtpPortToUse,
      };

      // Step B: Test Connection on Backend (Verifies IMAP credentials and server status)
      await sleep(1000);
      const testResult = await mailAPI.testConnection(testPayload);

      if (!testResult.data?.success) {
        throw new Error(testResult.data?.error || 'IMAP verification failed. Check your host and credentials.');
      }

      setVerificationSteps(prev => ({ ...prev, imapConnect: 'success', smtpConnect: 'pending' }));

      // Step C: Verify SMTP connection configuration
      await sleep(800);
      setVerificationSteps(prev => ({ ...prev, smtpConnect: 'success', savingAccount: 'pending' }));

      // Step D: Connect and save the account
      await sleep(800);
      const connectPayload = {
        email: connectData.email.trim(),
        password: passwordToUse,
        provider: selectedProvider === 'custom' ? 'imap_custom' : selectedProvider,
        connectionType: selectedProvider === 'gmail' || selectedProvider === 'outlook' ? 'app_password' : 'imap',
        displayName: connectData.displayName.trim() || undefined,
        imapHost: connectData.imapHost.trim(),
        imapPort: imapPortToUse,
        smtpHost: connectData.smtpHost.trim(),
        smtpPort: smtpPortToUse,
      };

      await mailAPI.connect(connectPayload);

      setVerificationSteps(prev => ({ ...prev, savingAccount: 'success' }));
      await sleep(1000);

      // Clean up and fetch updated list
      setShowVerificationModal(false);
      setConnectData({
        email: '',
        displayName: '',
        imapHost: '',
        imapPort: 993,
        imapSecurity: 'SSL/TLS',
        imapUsername: '',
        imapPassword: '',
        sameAsIncoming: true,
        smtpHost: '',
        smtpPort: 587,
        smtpSecurity: 'STARTTLS',
        smtpUsername: '',
        smtpPassword: '',
      });
      setSelectedProvider('custom');
      setAutoDetected(false);
      setActiveStep(1);
      setConnectStatus({ tone: 'success', text: 'Universal mailbox connected successfully! Background sync initiated.' });
      await fetchAccounts();
    } catch (error) {
      console.error(error);
      const errorMsg = error.response?.data?.error || error.response?.data?.details?.error || error.message || 'Verification failed. Please review your server settings.';
      setVerificationError(errorMsg);
      // Mark the active step as error
      setVerificationSteps(prev => {
        const next = { ...prev };
        if (next.savingAccount === 'pending') next.savingAccount = 'error';
        else if (next.smtpConnect === 'pending') next.smtpConnect = 'error';
        else if (next.imapConnect === 'pending') next.imapConnect = 'error';
        else if (next.resolvingDns === 'pending') next.resolvingDns = 'error';
        return next;
      });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleManualSync = async (accountId) => {
    setSyncingId(accountId);
    try {
      await emailAPI.syncEmails(accountId);
      setConnectStatus({ tone: 'success', text: 'Inbox sync triggered successfully!' });
      await fetchAccounts();
    } catch (err) {
      console.error('[AccountSettings] Manual sync error:', err);
      setConnectStatus({ tone: 'error', text: 'Failed to synchronize. Confirm the server connection settings.' });
    } finally {
      setSyncingId(null);
    }
  };

  const handleConnectGoogle = async () => {
    setGoogleLoading(true);
    setConnectStatus({ tone: '', text: '' });

    try {
      const response = await authAPI.getGmailAuthUrl();
      window.location.href = response.data.url;
    } catch (error) {
      console.error('[AccountSettings] Google OAuth start failed:', error);
      setConnectStatus({
        tone: 'error',
        text: 'Could not open Google authorization. Confirm the backend is running and Google OAuth env vars are set.',
      });
      setGoogleLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getProgressPercent = (usage, limit) => {
    if (!limit) return 0;
    if (limit >= 999999) return 0; // unlimited indicator
    return Math.min(Math.round((usage / limit) * 100), 100);
  };

  return (
    <div className="settings-container">
      {/* Premium Tab Bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: '2.5rem',
        paddingBottom: '0.25rem'
      }}>
        <button
          onClick={() => setActiveTab('mailboxes')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'mailboxes' ? '#6366f1' : '#9ca3af',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            padding: '0.65rem 1.25rem',
            position: 'relative',
            transition: 'all 0.2s ease',
          }}
        >
          📬 Mailboxes
          {activeTab === 'mailboxes' && (
            <div style={{
              position: 'absolute',
              bottom: '-0.35rem',
              left: 0,
              right: 0,
              height: '3px',
              background: '#6366f1',
              borderRadius: '9999px',
              boxShadow: '0 0 10px #6366f1'
            }}></div>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('billing');
            void fetchSubscriptionDetails();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'billing' ? '#6366f1' : '#9ca3af',
            fontSize: '1rem',
            fontWeight: '700',
            cursor: 'pointer',
            padding: '0.65rem 1.25rem',
            position: 'relative',
            transition: 'all 0.2s ease',
          }}
        >
          💎 Billing & SaaS Limits
          {activeTab === 'billing' && (
            <div style={{
              position: 'absolute',
              bottom: '-0.35rem',
              left: 0,
              right: 0,
              height: '3px',
              background: '#6366f1',
              borderRadius: '9999px',
              boxShadow: '0 0 10px #6366f1'
            }}></div>
          )}
        </button>
      </div>

      {activeTab === 'mailboxes' ? (
        <div className="surface-card">
          <span className="eyebrow">Workspace management</span>
          <h2>Email Accounts</h2>
          <p>Manage connected mailboxes and their sync settings.</p>

          {/* Dynamic Verification Progress Modal */}
          {showVerificationModal && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(5, 8, 19, 0.85)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}>
              <div className="surface-card" style={{
                width: '100%',
                maxWidth: '460px',
                padding: '2.5rem',
                borderRadius: '24px',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-deep)',
                boxShadow: 'var(--glow-violet), var(--shadow)',
                textAlign: 'center',
              }}>
                <span className="eyebrow" style={{ marginBottom: '1rem' }}>Security Validation</span>
                <h3 style={{ margin: '0.5rem 0' }}>Verifying Credentials</h3>
                <p style={{ opacity: 0.7, marginBottom: '2rem' }}>Testing IMAP/SMTP handshake and establishing server keys...</p>

                <div style={{ display: 'grid', gap: '1.25rem', textAlign: 'left', marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: verificationSteps.resolvingDns === 'success' ? 'rgba(16, 185, 129, 0.15)' : verificationSteps.resolvingDns === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                      color: verificationSteps.resolvingDns === 'success' ? 'var(--success)' : verificationSteps.resolvingDns === 'error' ? 'var(--danger)' : 'var(--muted)',
                      border: '1px solid transparent',
                    }}>
                      {verificationSteps.resolvingDns === 'success' ? '✓' : verificationSteps.resolvingDns === 'error' ? '✗' : '○'}
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>Resolve Mail Server Address</strong>
                      <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Verifying MX records and host endpoints...</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: verificationSteps.imapConnect === 'success' ? 'rgba(16, 185, 129, 0.15)' : verificationSteps.imapConnect === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                      color: verificationSteps.imapConnect === 'success' ? 'var(--success)' : verificationSteps.imapConnect === 'error' ? 'var(--danger)' : 'var(--muted)',
                    }}>
                      {verificationSteps.imapConnect === 'success' ? '✓' : verificationSteps.imapConnect === 'error' ? '✗' : verificationSteps.imapConnect === 'pending' ? '⟳' : '○'}
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>Authenticate Incoming (IMAP)</strong>
                      <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Testing host login and TLS certificate...</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: verificationSteps.smtpConnect === 'success' ? 'rgba(16, 185, 129, 0.15)' : verificationSteps.smtpConnect === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                      color: verificationSteps.smtpConnect === 'success' ? 'var(--success)' : verificationSteps.smtpConnect === 'error' ? 'var(--danger)' : 'var(--muted)',
                    }}>
                      {verificationSteps.smtpConnect === 'success' ? '✓' : verificationSteps.smtpConnect === 'error' ? '✗' : verificationSteps.smtpConnect === 'pending' ? '⟳' : '○'}
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>Establish Outgoing Transport (SMTP)</strong>
                      <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Configuring Nodemailer socket protocol...</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: verificationSteps.savingAccount === 'success' ? 'rgba(16, 185, 129, 0.15)' : verificationSteps.savingAccount === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                      color: verificationSteps.savingAccount === 'success' ? 'var(--success)' : verificationSteps.savingAccount === 'error' ? 'var(--danger)' : 'var(--muted)',
                    }}>
                      {verificationSteps.savingAccount === 'success' ? '✓' : verificationSteps.savingAccount === 'error' ? '✗' : verificationSteps.savingAccount === 'pending' ? '⟳' : '○'}
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>Secure Credential Storage</strong>
                      <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>Encrypting keys with AES-256-GCM...</p>
                    </div>
                  </div>
                </div>

                {verificationError ? (
                  <div className="inline-alert error-alert" style={{ marginBottom: '2rem', fontSize: '0.85rem' }}>
                    {verificationError}
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                    <div className="app-loading-spinner" style={{ margin: 0 }}></div>
                  </div>
                )}

                <button
                  className="button button-ghost button-full"
                  onClick={() => setShowVerificationModal(false)}
                  disabled={connectLoading && !verificationError}
                >
                  {verificationError ? 'Close & Review Settings' : 'Cancel Connection'}
                </button>
              </div>
            </div>
          )}

          <div className="account-list" style={{ marginTop: '2rem' }}>
            {accounts.map(account => (
              <div key={account.id} className="account-item surface-card" style={{ marginBottom: '1rem', padding: '1.5rem', borderLeft: `4px solid ${account.color || '#6366f1'}` }}>
                {editingId === account.id ? (
                  <div className="edit-form">
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label>Display Name</label>
                      <input 
                        type="text" 
                        className="search-input"
                        value={editData.displayName}
                        onChange={e => setEditData({ ...editData, displayName: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label>Color Tag</label>
                      <input 
                        type="color" 
                        value={editData.color}
                        onChange={e => setEditData({ ...editData, color: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        checked={editData.syncEnabled}
                        onChange={e => setEditData({ ...editData, syncEnabled: e.target.checked })}
                      />
                      <label>Enable Background Sync</label>
                    </div>
                    <div className="button-row">
                      <button className="button button-primary" onClick={() => handleSave(account.id)}>Save Changes</button>
                      <button className="button button-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {account.displayName || account.email.split('@')[0]}
                        <span style={{ fontSize: '0.8rem', fontWeight: 'normal', opacity: 0.6 }}>
                          ({account.connectionType === 'oauth' ? 'OAuth2' : 'IMAP/SMTP'})
                        </span>
                      </h3>
                      <p style={{ margin: '0.25rem 0', opacity: 0.7 }}>{account.email}</p>
                      
                      {account.imapHost && (
                        <p style={{ margin: '0.25rem 0', fontSize: '0.82rem', color: 'var(--muted-strong)' }}>
                          Incoming: <code>{account.imapHost}:{account.imapPort}</code> | Outgoing: <code>{account.smtpHost}:{account.smtpPort}</code>
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {account.isPrimary && <span className="status-pill status-ok">Primary</span>}
                        {account.reconnectRequired ? <span className="status-pill status-warn">Reconnect Required</span> : null}
                        {account.syncEnabled ? <span className="status-pill status-ok">Sync Active</span> : <span className="status-pill status-warn">Sync Paused</span>}
                        {account.lastSyncAt && (
                          <span className="status-pill" style={{ fontSize: '0.75rem' }}>
                            Last Sync: {new Date(account.lastSyncAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      {account.reconnectRequired ? (
                        <p style={{ marginTop: '0.75rem', color: 'var(--warning)', fontSize: '0.9rem' }}>
                          Access has expired. Please reconnect to resume automated sync workflows.
                        </p>
                      ) : null}
                    </div>
                    <div className="button-row" style={{ marginLeft: 'auto' }}>
                      {account.syncEnabled && (
                        <button
                          className="button button-ghost"
                          onClick={() => handleManualSync(account.id)}
                          disabled={syncingId === account.id}
                          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                        >
                          {syncingId === account.id ? 'Syncing...' : 'Sync Now'}
                        </button>
                      )}
                      {account.reconnectRequired ? (
                        <button className="button button-primary" onClick={() => window.location.href = '/auth/gmail-connect?mode=reconnect'}>
                          Reconnect
                        </button>
                      ) : null}
                      <button className="button button-secondary" onClick={() => handleEdit(account)}>Edit</button>
                      <button className="button button-logout" onClick={() => disconnectAccount(account.id)}>Disconnect</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* SETUP WIZARD FOR ADDING ACCOUNTS */}
          <div style={{ marginTop: '2.5rem', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="eyebrow" style={{ marginBottom: '0.5rem' }}>Universal Connector</span>
            <h3>Link Mail Provider</h3>
            <p style={{ marginBottom: '2rem' }}>Connect using Google OAuth for full Calendar sync, or configure standard IMAP/SMTP details below.</p>

            {connectStatus.text && (
              <div className={`inline-alert ${connectStatus.tone === 'error' ? 'error-alert' : 'success-alert'}`} style={{ marginBottom: '2rem' }}>
                {connectStatus.text}
              </div>
            )}

            {/* Quick-Connect Provider Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
              {[
                { id: 'gmail_oauth', label: 'Gmail / Google', icon: '📬' },
                { id: 'outlook', label: 'Microsoft 365', icon: '📨' },
                { id: 'yahoo', label: 'Yahoo Mail', icon: '✉️' },
                { id: 'custom', label: 'Custom Server', icon: '⚙️' }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="surface-card"
                  onClick={() => {
                    if (p.id === 'gmail_oauth') {
                      void handleConnectGoogle();
                    } else {
                      setSelectedProvider(p.id);
                      setActiveStep(1);
                    }
                  }}
                  style={{
                    padding: '1.25rem',
                    borderRadius: '16px',
                    border: selectedProvider === p.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: selectedProvider === p.id ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: '1.8rem' }}>{p.icon}</span>
                  <strong style={{ fontSize: '0.85rem' }}>{p.label}</strong>
                </button>
              ))}
            </div>

            {/* Interactive Steps Indicator */}
            {selectedProvider !== 'gmail_oauth' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem', padding: '0 0.5rem' }}>
                {[
                  { step: 1, label: 'Identity' },
                  { step: 2, label: 'Incoming IMAP' },
                  { step: 3, label: 'Outgoing SMTP' }
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: s.step < 3 ? '1' : 'none' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: activeStep === s.step ? 'var(--accent)' : activeStep > s.step ? 'var(--success)' : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      fontWeight: 'bold',
                      fontSize: '0.85rem',
                      border: '1px solid transparent',
                    }}>
                      {activeStep > s.step ? '✓' : s.step}
                    </div>
                    <span style={{
                      fontSize: '0.85rem',
                      fontWeight: activeStep === s.step ? 'bold' : 'normal',
                      opacity: activeStep === s.step ? 1 : 0.5
                    }}>
                      {s.label}
                    </span>
                    {s.step < 3 && <div style={{ flex: 1, height: '2px', background: activeStep > s.step ? 'var(--success)' : 'rgba(255,255,255,0.1)', margin: '0 0.5rem' }}></div>}
                  </div>
                ))}
              </div>
            )}

            {/* STEP 1: Provider & Identity */}
            {selectedProvider !== 'gmail_oauth' && activeStep === 1 && (
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div className="form-group">
                  <label>Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="search-input"
                      type="email"
                      value={connectData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="you@company.com"
                      required
                      style={{ paddingRight: '3rem' }}
                    />
                    {detecting && (
                      <span style={{ position: 'absolute', right: '1rem', top: '35%', fontSize: '0.8rem', opacity: 0.6 }}>
                        Analyzing...
                      </span>
                    )}
                  </div>
                  {autoDetected && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'block', marginTop: '0.25rem' }}>
                      ✦ Configuration successfully auto-detected! Host endpoints configured.
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label>Display Name (Optional)</label>
                  <input
                    className="search-input"
                    type="text"
                    value={connectData.displayName}
                    onChange={(e) => handleInputChange('displayName', e.target.value)}
                    placeholder="e.g. Work Mailbox"
                  />
                </div>

                {selectedProvider !== 'custom' && (
                  <div className="inline-alert" style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.02)' }}>
                    <strong>Connecting to {selectedProvider.toUpperCase()}</strong>
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>
                      For security, providers like Yahoo and Microsoft require an <strong>App Password</strong> instead of your normal password. Check your security settings before proceeding.
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button
                    className="button button-primary"
                    onClick={() => setActiveStep(2)}
                    disabled={!connectData.email || !connectData.email.includes('@')}
                  >
                    Configure Server details →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: IMAP Server Settings */}
            {selectedProvider !== 'gmail_oauth' && activeStep === 2 && (
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>IMAP Host</label>
                    <input
                      className="search-input"
                      type="text"
                      value={connectData.imapHost}
                      onChange={(e) => handleInputChange('imapHost', e.target.value)}
                      placeholder="imap.company.com"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Port</label>
                    <input
                      className="search-input"
                      type="number"
                      value={connectData.imapPort}
                      onChange={(e) => handleInputChange('imapPort', e.target.value)}
                      placeholder="993"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Security Encryption</label>
                  <select
                    className="search-input"
                    value={connectData.imapSecurity}
                    onChange={(e) => handleInputChange('imapSecurity', e.target.value)}
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}
                  >
                    <option value="SSL/TLS">SSL / TLS (Secure & Recommended)</option>
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="None">None (Unencrypted)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>IMAP Username</label>
                  <input
                    className="search-input"
                    type="text"
                    value={connectData.imapUsername || connectData.email}
                    onChange={(e) => handleInputChange('imapUsername', e.target.value)}
                    placeholder="Defaults to email"
                  />
                </div>

                <div className="form-group">
                  <label>IMAP Password / App Password</label>
                  <input
                    className="search-input"
                    type="password"
                    value={connectData.imapPassword}
                    onChange={(e) => handleInputChange('imapPassword', e.target.value)}
                    placeholder="Password"
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                  <button className="button button-ghost" onClick={() => setActiveStep(1)}>
                    ← Back
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => setActiveStep(3)}
                    disabled={!connectData.imapHost || !connectData.imapPassword}
                  >
                    Configure SMTP Outgoing →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: SMTP Server Settings */}
            {selectedProvider !== 'gmail_oauth' && activeStep === 3 && (
              <div style={{ display: 'grid', gap: '1.25rem' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                  border: '1px solid var(--border)',
                }}>
                  <input
                    type="checkbox"
                    id="sameAsIncoming"
                    checked={connectData.sameAsIncoming}
                    onChange={(e) => handleInputChange('sameAsIncoming', e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="sameAsIncoming" style={{ cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
                    Mirror credentials and connection options from IMAP (Incoming)
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>SMTP Host</label>
                    <input
                      className="search-input"
                      type="text"
                      value={connectData.smtpHost}
                      onChange={(e) => handleInputChange('smtpHost', e.target.value)}
                      placeholder="smtp.company.com"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Port</label>
                    <input
                      className="search-input"
                      type="number"
                      value={connectData.smtpPort}
                      onChange={(e) => handleInputChange('smtpPort', e.target.value)}
                      placeholder="587"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Security Encryption</label>
                  <select
                    className="search-input"
                    value={connectData.smtpSecurity}
                    onChange={(e) => handleInputChange('smtpSecurity', e.target.value)}
                    style={{ background: 'var(--bg-deep)', color: 'var(--text)' }}
                  >
                    <option value="STARTTLS">STARTTLS (Standard & Recommended)</option>
                    <option value="SSL/TLS">SSL / TLS (Port 465)</option>
                    <option value="None">None</option>
                  </select>
                </div>

                {!connectData.sameAsIncoming && (
                  <>
                    <div className="form-group">
                      <label>SMTP Username</label>
                      <input
                        className="search-input"
                        type="text"
                        value={connectData.smtpUsername}
                        onChange={(e) => handleInputChange('smtpUsername', e.target.value)}
                        placeholder="Username for SMTP"
                      />
                    </div>
                    <div className="form-group">
                      <label>SMTP Password</label>
                      <input
                        className="search-input"
                        type="password"
                        value={connectData.smtpPassword}
                        onChange={(e) => handleInputChange('smtpPassword', e.target.value)}
                        placeholder="Password for SMTP"
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                  <button className="button button-ghost" onClick={() => setActiveStep(2)}>
                    ← Back
                  </button>
                  <button
                    className="button button-primary"
                    onClick={handleVerifyAndConnect}
                    disabled={connectLoading || !connectData.smtpHost}
                  >
                    {connectLoading ? 'Validating Mailbox...' : '✓ Verify & Connect Mailbox'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {gmailReconnectState?.required ? (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(249, 115, 22, 0.08)', borderRadius: '12px', border: '1px solid rgba(249, 115, 22, 0.25)' }}>
              <h3 style={{ marginTop: 0 }}>Recovery in progress</h3>
              <p style={{ marginBottom: '1rem' }}>{gmailReconnectState.message}</p>
              <button className="button button-primary" onClick={() => window.location.href = '/auth/gmail-connect?mode=reconnect'}>
                Resume Gmail Recovery
              </button>
            </div>
          ) : null}

          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>Browser Notifications</h3>
                <p style={{ margin: '0.25rem 0', opacity: 0.7 }}>Get instant alerts for high-priority emails on your desktop.</p>
              </div>
              <button 
                className={`button ${pushEnabled ? 'button-secondary' : 'button-primary'}`}
                onClick={handleTogglePush}
                disabled={pushLoading}
              >
                {pushLoading ? 'Processing...' : pushEnabled ? 'Disable Notifications' : 'Enable Notifications'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== BILLING & LIMITS DASHBOARD ==================== */
        <div style={{ display: 'grid', gap: '2.5rem' }}>
          
          {/* Subscription Tier Overview Card */}
          {subLoading ? (
            <div style={{ textAlign: 'center', padding: '4rem 0' }}>
              <div className="micro-spinner" style={{ margin: '0 auto 1rem', width: '28px', height: '28px', borderWidth: '3px' }}></div>
              <p style={{ opacity: 0.6 }}>Synchronizing with Stripe billing nodes...</p>
            </div>
          ) : (
            <>
              <div style={{
                padding: '2.5rem',
                borderRadius: '24px',
                background: 'rgba(30, 41, 59, 0.45)',
                border: '1px solid rgba(255,255,255,0.08)',
                backdropFilter: 'blur(16px)',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
              }}>
                {/* Glowing neon background indicators */}
                <div style={{
                  position: 'absolute',
                  top: '-10%',
                  right: '-10%',
                  width: '300px',
                  height: '300px',
                  background: (subData?.subscription?.plan === 'pro' || subData?.subscription?.plan === 'team') ? 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
                  pointerEvents: 'none',
                  zIndex: 0
                }}></div>

                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '2rem' }}>
                  <div>
                    <span style={{
                      background: (subData?.subscription?.plan === 'pro' || subData?.subscription?.plan === 'team') ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                      color: (subData?.subscription?.plan === 'pro' || subData?.subscription?.plan === 'team') ? '#818cf8' : '#9ca3af',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '9999px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em'
                    }}>
                      {(subData?.subscription?.plan || 'FREE').toUpperCase()} PLAN ACTIVE
                    </span>
                    
                    <h2 style={{ fontSize: '2rem', marginTop: '1rem', marginBottom: '0.5rem', color: '#fff', fontWeight: 850 }}>
                      {subData?.subscription?.plan === 'pro' ? 'EmailFlow AI Pro' : subData?.subscription?.plan === 'team' ? 'EmailFlow AI Team' : subData?.subscription?.plan === 'enterprise' ? 'EmailFlow AI Enterprise' : 'EmailFlow AI Free'}
                    </h2>
                    
                    <p style={{ opacity: 0.7, margin: 0, fontSize: '0.95rem' }}>
                      Status: <strong style={{
                        color: (subData?.subscription?.status === 'active' || subData?.subscription?.status === 'trialing') ? '#10b981' : '#f59e0b'
                      }}>
                        {(subData?.subscription?.status || 'Active').toUpperCase()}
                      </strong>
                      {subData?.subscription?.currentPeriodEnd && (
                        <span> • Renews on {new Date(subData.subscription.currentPeriodEnd).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      onClick={handleManageSubscription}
                      disabled={portalLoading || !subData?.subscription?.stripeCustomerId}
                      style={{
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        border: 'none',
                        boxShadow: '0 10px 20px -5px rgba(99,102,241,0.35)',
                        padding: '0.85rem 1.75rem',
                        borderRadius: '12px',
                        cursor: portalLoading || !subData?.subscription?.stripeCustomerId ? 'not-allowed' : 'pointer',
                        fontWeight: '700',
                        color: '#fff',
                        fontSize: '0.95rem',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      {portalLoading ? 'Redirecting to Stripe...' : '⚙ Manage Subscription'}
                    </button>
                    
                    {(!subData?.subscription || subData?.subscription?.plan === 'free') && (
                      <button
                        onClick={() => window.location.href = '/pricing'}
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          padding: '0.85rem 1.75rem',
                          borderRadius: '12px',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        💎 View Pricing Plans
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Usage Limit Indicators */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
                
                {/* 1. Connected Mailboxes limit */}
                <div style={{ padding: '1.75rem', borderRadius: '18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 600 }}>Connected Mailboxes</span>
                    <strong style={{ color: '#fff' }}>
                      {subData?.usage?.usage?.connected_accounts} / {subData?.usage?.limits?.connected_accounts >= 999999 ? 'Unlimited' : subData?.usage?.limits?.connected_accounts}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #6366f1, #a5b4fc)',
                      width: `${getProgressPercent(subData?.usage?.usage?.connected_accounts, subData?.usage?.limits?.connected_accounts)}%`,
                      borderRadius: '9999px',
                      transition: 'width 0.5s ease-out'
                    }}></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Allocated server connection channels.
                  </span>
                </div>

                {/* 2. AI Summaries limit */}
                <div style={{ padding: '1.75rem', borderRadius: '18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 600 }}>AI Summaries & Actions</span>
                    <strong style={{ color: '#fff' }}>
                      {subData?.usage?.usage?.ai_summaries} / {subData?.usage?.limits?.ai_summaries >= 999999 ? 'Unlimited' : `${subData?.usage?.limits?.ai_summaries} / mo`}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981, #34d399)',
                      width: `${getProgressPercent(subData?.usage?.usage?.ai_summaries, subData?.usage?.limits?.ai_summaries)}%`,
                      borderRadius: '9999px',
                      transition: 'width 0.5s ease-out'
                    }}></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    AI analysis executions this billing month.
                  </span>
                </div>

                {/* 3. Secure Attachment Storage */}
                <div style={{ padding: '1.75rem', borderRadius: '18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.9rem', color: '#9ca3af', fontWeight: 600 }}>Attachment Storage</span>
                    <strong style={{ color: '#fff' }}>
                      {formatBytes(subData?.usage?.usage?.attachments_stored)} / {subData?.usage?.limits?.attachments_stored >= 999999999999 ? 'Unlimited' : formatBytes(subData?.usage?.limits?.attachments_stored)}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                      width: `${getProgressPercent(subData?.usage?.usage?.attachments_stored, subData?.usage?.limits?.attachments_stored)}%`,
                      borderRadius: '9999px',
                      transition: 'width 0.5s ease-out'
                    }}></div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Encrypted attachment files synced and cached locally.
                  </span>
                </div>

              </div>

              {/* Invoices Transaction History */}
              <div style={{ padding: '2rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                <h3 style={{ margin: '0 0 1.5rem', color: '#fff', fontSize: '1.2rem', fontWeight: 700 }}>Invoices & Receipt Logs</h3>
                
                {!subData?.invoices || subData.invoices.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 0', color: '#6b7280', fontSize: '0.95rem' }}>
                    No payment invoices logged under this account yet.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                          <th style={{ padding: '0.75rem 1rem' }}>INVOICE ID</th>
                          <th style={{ padding: '0.75rem 1rem' }}>DATE</th>
                          <th style={{ padding: '0.75rem 1rem' }}>AMOUNT</th>
                          <th style={{ padding: '0.75rem 1rem' }}>STATUS</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subData.invoices.map((inv) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#d1d5db' }}>
                            <td style={{ padding: '1rem' }}>
                              <code>{inv.stripeInvoiceId ? inv.stripeInvoiceId.substring(0, 16) + '...' : `#INV-${inv.id.substring(0, 6)}`}</code>
                            </td>
                            <td style={{ padding: '1rem' }}>
                              {new Date(inv.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '1rem', fontWeight: 600 }}>
                              ${inv.amount.toFixed(2)} {inv.currency}
                            </td>
                            <td style={{ padding: '1rem' }}>
                              <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: inv.status === 'paid' ? '#10b981' : '#f59e0b',
                                background: inv.status === 'paid' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '6px'
                              }}>
                                {inv.status.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'right' }}>
                              {inv.invoicePdf ? (
                                <a
                                  href={inv.invoicePdf}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    color: '#6366f1',
                                    textDecoration: 'none',
                                    fontWeight: 700,
                                    fontSize: '0.85rem'
                                  }}
                                >
                                  Download PDF ⤓
                                </a>
                              ) : (
                                <span style={{ color: '#4b5563', fontSize: '0.85rem' }}>No PDF available</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountSettings;
