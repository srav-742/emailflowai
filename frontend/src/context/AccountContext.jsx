import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { accountAPI } from '../services/api';
import { useAuth } from './AuthContext';

const AccountContext = createContext(null);

export const AccountProvider = ({ children }) => {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState(null); // null means "All Accounts"

  const fetchAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await accountAPI.list();
      setAccounts(response.data);
    } catch (error) {
      console.error('[AccountContext] Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const updateAccountSettings = async (id, data) => {
    try {
      const response = await accountAPI.update(id, data);
      setAccounts(prev => prev.map(acc => acc.id === id ? response.data : acc));
      return response.data;
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
