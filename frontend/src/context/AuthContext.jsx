/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { auth, googleProvider, GoogleAuthProvider, signInWithPopup, signOut } from '../config/firebase';
import {
  GMAIL_RECONNECT_EVENT,
  clearGmailReconnectState,
  readStoredReconnectState,
  setGmailReconnectState,
} from '../utils/gmailReconnect';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken]     = useState(() => localStorage.getItem('token'));
  const [gmailReconnectState, setLocalGmailReconnectState] = useState(() => (
    typeof window !== 'undefined'
      ? readStoredReconnectState()
      : { required: false, message: '', email: null, source: null, timestamp: null }
  ));

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setToken(null);
    setUser(null);
    setLocalGmailReconnectState(clearGmailReconnectState());
  }, []);

  const markGmailReconnectRequired = useCallback((payload = {}) => {
    const nextState = setGmailReconnectState(payload);
    setLocalGmailReconnectState(nextState);
    return nextState;
  }, []);

  const clearGmailReconnectRequired = useCallback(() => {
    const nextState = clearGmailReconnectState();
    setLocalGmailReconnectState(nextState);
    return nextState;
  }, []);

  const refreshProfile = useCallback(async () => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.getProfile();
      setUser(response.data.user);
      if (response.data.user?.hasGmailAccess) {
        clearGmailReconnectRequired();
      }
    } catch (error) {
      const status = error?.response?.status;
      // 401 = invalid/expired token → clear session silently
      if (status === 401 || status === 403) {
        clearSession();
      } else {
        // Network error or server down — keep token, just clear user state temporarily
        console.warn('[Auth] Profile fetch failed (server may be restarting):', error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [clearGmailReconnectRequired, clearSession]);

  // Load profile on mount and whenever token changes
  useEffect(() => {
    if (token) {
      refreshProfile();
    } else {
      setLoading(false);
    }
  }, [token, refreshProfile]);

  useEffect(() => {
    const handleReconnectEvent = (event) => {
      setLocalGmailReconnectState(event?.detail || { required: false, message: '', email: null, source: null, timestamp: null });
    };

    window.addEventListener(GMAIL_RECONNECT_EVENT, handleReconnectEvent);
    return () => window.removeEventListener(GMAIL_RECONNECT_EVENT, handleReconnectEvent);
  }, []);

  const authenticateWithGoogle = useCallback(async () => {
    try {
      const result          = await signInWithPopup(auth, googleProvider);
      const firebaseUser    = result.user;
      const idToken         = await firebaseUser.getIdToken();
      const googleCredential = GoogleAuthProvider.credentialFromResult(result);
      const googleAccessToken = googleCredential?.accessToken || null;

      const response = await authAPI.firebaseLogin(idToken, googleAccessToken);
      const { token: jwtToken, user: userData } = response.data;

      localStorage.setItem('token', jwtToken);
      setToken(jwtToken);
      setUser(userData);
      clearGmailReconnectRequired();

      return { success: true, user: userData };
    } catch (error) {
      console.error('[Auth] Google login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelled by user');
      }
      if (error?.response?.status === 503) {
        throw new Error('Sign-in is temporarily unavailable while the server reconnects to the database. Please try again in a moment.');
      }
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw new Error(error?.message || 'Failed to sign in with Google. Please try again.');
    }
  }, [clearGmailReconnectRequired]);

  const loginWithGoogle   = useCallback(() => authenticateWithGoogle(), [authenticateWithGoogle]);
  const grantInboxAccess  = useCallback(() => authenticateWithGoogle(), [authenticateWithGoogle]);

  const logout = useCallback(async () => {
    try {
      const storedRefreshToken = localStorage.getItem('refreshToken');
      await authAPI.logout(storedRefreshToken);
      await signOut(auth);
    } catch (error) {
      // Ignore errors during logout
      console.warn('[Auth] Logout warning:', error.message);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      setToken,
      loading,
      loginWithGoogle,
      grantInboxAccess,
      logout,
      refreshProfile,
      gmailReconnectState,
      markGmailReconnectRequired,
      clearGmailReconnectRequired,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
