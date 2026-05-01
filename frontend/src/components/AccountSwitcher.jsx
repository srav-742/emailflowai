import { useAccounts } from '../context/AccountContext';

const AccountSwitcher = ({ sidebarOpen }) => {
  const { accounts, selectedAccountId, setSelectedAccountId } = useAccounts();

  if (accounts.length <= 1 && !selectedAccountId) return null;

  return (
    <div className="account-switcher">
      <span className="eyebrow" style={{ paddingLeft: '0.75rem', marginBottom: '0.5rem', display: 'block' }}>
        {sidebarOpen ? 'Connected Accounts' : 'Acc'}
      </span>
      
      <button 
        className={`sidebar-link ${selectedAccountId === null ? 'active' : ''}`}
        onClick={() => setSelectedAccountId(null)}
      >
        <span className="sidebar-link-line"></span>
        <span className="account-dot" style={{ background: 'var(--accent)' }}></span>
        {sidebarOpen && <span><strong>All Accounts</strong><small>Unified view</small></span>}
      </button>

      {accounts.map(account => (
        <button 
          key={account.id} 
          className={`sidebar-link ${selectedAccountId === account.id ? 'active' : ''}`}
          onClick={() => setSelectedAccountId(account.id)}
        >
          <span className="sidebar-link-line"></span>
          <span className="account-dot" style={{ background: account.color || '#6366f1' }}></span>
          {sidebarOpen && (
            <span>
              <strong>{account.displayName || account.email.split('@')[0]}</strong>
              <small>{account.email}</small>
            </span>
          )}
          {!sidebarOpen && <strong>{account.email.slice(0, 2).toUpperCase()}</strong>}
        </button>
      ))}
    </div>
  );
};

export default AccountSwitcher;
