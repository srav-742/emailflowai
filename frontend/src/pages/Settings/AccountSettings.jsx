import { useState } from 'react';
import { useAccounts } from '../../context/AccountContext';
import { useAuth } from '../../context/AuthContext';
import { mailAPI } from '../../services/api';
import { subscribeToPush, unsubscribeFromPush } from '../../utils/pushSubscribe';

const AccountSettings = () => {
  const { accounts, updateAccountSettings, disconnectAccount, fetchAccounts } = useAccounts();
  const { token, gmailReconnectState } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [pushLoading, setPushLoading] = useState(false);
  const [pushEnabled, setPushEnabled] = useState('Notification' in window && Notification.permission === 'granted');
  const [connectData, setConnectData] = useState({ email: '', password: '', otp: '', displayName: '' });
  const [connectStatus, setConnectStatus] = useState({ tone: '', text: '' });
  const [connectLoading, setConnectLoading] = useState(false);

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

  const handleConnectMail = async (event) => {
    event.preventDefault();
    setConnectLoading(true);
    setConnectStatus({ tone: '', text: '' });

    try {
      await mailAPI.connect({
        email: connectData.email.trim(),
        password: (connectData.otp || connectData.password).trim(),
        displayName: connectData.displayName.trim() || undefined,
        connectionType: 'app_password',
      });

      setConnectData({ email: '', password: '', otp: '', displayName: '' });
      await fetchAccounts();
      setConnectStatus({ tone: 'success', text: 'Mailbox connected. Run Sync now in the inbox to load the latest messages.' });
    } catch (error) {
      setConnectStatus({
        tone: 'error',
        text: error.response?.data?.error || error.response?.data?.details?.error || 'Could not connect this mailbox. Check the email and app password/OTP.',
      });
    } finally {
      setConnectLoading(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="surface-card">
        <span className="eyebrow">Workspace management</span>
        <h2>Email Accounts</h2>
        <p>Manage connected mailboxes and their sync settings.</p>

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{account.displayName || account.email.split('@')[0]}</h3>
                    <p style={{ margin: '0.25rem 0', opacity: 0.7 }}>{account.email}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {account.isPrimary && <span className="status-pill status-ok">Primary</span>}
                      {account.reconnectRequired ? <span className="status-pill status-warn">Reconnect Required</span> : null}
                      {account.syncEnabled ? <span className="status-pill">Sync On</span> : <span className="status-pill status-warn">Sync Off</span>}
                    </div>
                    {account.reconnectRequired ? (
                      <p style={{ marginTop: '0.75rem', color: 'var(--warning)', fontSize: '0.9rem' }}>
                        OAuth access expired for this account. Reconnect to resume background sync and calendar updates.
                      </p>
                    ) : null}
                  </div>
                  <div className="button-row">
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

        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(99, 102, 241, 0.05)', borderRadius: '12px', border: '1px dashed rgba(99, 102, 241, 0.3)' }}>
          <h3>Add another account</h3>
          <p>Use the mailbox email and password, app password, or OTP provided by your mail provider.</p>
          {connectStatus.text ? (
            <div className={`inline-alert ${connectStatus.tone === 'error' ? 'error-alert' : 'success-alert'}`} style={{ marginBottom: '1rem' }}>
              {connectStatus.text}
            </div>
          ) : null}
          <form onSubmit={handleConnectMail} style={{ display: 'grid', gap: '1rem' }}>
            <div className="form-group">
              <label>Email address</label>
              <input
                className="search-input"
                type="email"
                value={connectData.email}
                onChange={(event) => setConnectData({ ...connectData, email: event.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Mailbox password</label>
              <input
                className="search-input"
                type="password"
                value={connectData.password}
                onChange={(event) => setConnectData({ ...connectData, password: event.target.value })}
                placeholder="Normal password or app password"
              />
            </div>
            <div className="form-group">
              <label>OTP / app password</label>
              <input
                className="search-input"
                type="password"
                value={connectData.otp}
                onChange={(event) => setConnectData({ ...connectData, otp: event.target.value })}
                placeholder="Used instead of password when entered"
              />
            </div>
            <div className="form-group">
              <label>Display name</label>
              <input
                className="search-input"
                type="text"
                value={connectData.displayName}
                onChange={(event) => setConnectData({ ...connectData, displayName: event.target.value })}
                placeholder="Optional"
              />
            </div>
            <button className="button button-primary" type="submit" disabled={connectLoading || !connectData.email || (!connectData.password && !connectData.otp)}>
              {connectLoading ? 'Connecting...' : 'Connect Mailbox'}
            </button>
          </form>
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
    </div>
  );
};

export default AccountSettings;
