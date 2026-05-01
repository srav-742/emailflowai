import { useState } from 'react';
import { useAccounts } from '../../context/AccountContext';

const AccountSettings = () => {
  const { accounts, updateAccountSettings, disconnectAccount } = useAccounts();
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

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

  return (
    <div className="settings-container">
      <div className="surface-card">
        <span className="eyebrow">Workspace management</span>
        <h2>Gmail Accounts</h2>
        <p>Manage your connected Gmail accounts and their sync settings.</p>

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
                      {account.syncEnabled ? <span className="status-pill">Sync On</span> : <span className="status-pill status-warn">Sync Off</span>}
                    </div>
                  </div>
                  <div className="button-row">
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
          <p>You can connect multiple Gmail accounts to view them all in one unified dashboard.</p>
          <button className="button button-primary" onClick={() => window.location.href = '/auth/gmail-connect'}>
            Connect New Gmail Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;
