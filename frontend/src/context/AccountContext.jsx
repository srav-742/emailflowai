/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { accountAPI } from '../services/api';
import { useAuth } from './AuthContext';

const AccountContext = createContext(null);

function decorateAccount(account) {
  const reconnectRequired = (
    account?.provider === 'google' &&
    account?.syncEnabled === false &&
    account?.connectionType === 'oauth' &&
    !account?.hasOAuthTokens
  );

  return {
    ...account,
    reconnectRequired,
    statusLabel: reconnectRequired
      ? 'Reconnect Required'
      : account?.syncEnabled
        ? 'Sync Active'
        : 'Sync Paused',
  };
}

export const AccountProvider = ({ children }) => {
  const { token, clearGmailReconnectRequired, markGmailReconnectRequired } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(null); // null means "All Accounts"

  const fetchAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await accountAPI.list();
      const nextAccounts = Array.isArray(response.data) ? response.data.map(decorateAccount) : [];
      setAccounts(nextAccounts);

      const reconnectAccount = nextAccounts.find((account) => account.reconnectRequired);
      if (reconnectAccount) {
        markGmailReconnectRequired({
          message: reconnectAccount.email
            ? `${reconnectAccount.email} needs Gmail reconnection to resume sync.`
            : 'A Gmail account needs to be reconnected to resume sync.',
          email: reconnectAccount.email || null,
          source: 'accounts',
        });
      } else {
        clearGmailReconnectRequired();
      }
    } catch (error) {
      console.error('[AccountContext] Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  }, [clearGmailReconnectRequired, markGmailReconnectRequired, token]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const updateAccountSettings = async (id, data) => {
    try {
      const response = await accountAPI.update(id, data);
      const nextAccount = decorateAccount(response.data);
      setAccounts(prev => prev.map(acc => acc.id === id ? nextAccount : acc));
      return nextAccount;
    } catch (error) {
      console.error('[AccountContext] Failed to update account:', error);
      throw error;
    }
  };

  const disconnectAccount = async (id) => {
    try {
      await accountAPI.disconnect(id);
      setAccounts(prev => prev.filter(acc => acc.id !== id));
      if (selectedAccountId === id) setSelectedAccountId(null);
    } catch (error) {
      console.error('[AccountContext] Failed to disconnect account:', error);
      throw error;
    }
  };

  return (
    <AccountContext.Provider 
      value={{ 
        accounts, 
        loading, 
        selectedAccountId, 
        setSelectedAccountId, 
        fetchAccounts, 
        updateAccountSettings, 
        disconnectAccount 
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};

export const useAccounts = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccounts must be used within AccountProvider');
  }
  return context;
};
