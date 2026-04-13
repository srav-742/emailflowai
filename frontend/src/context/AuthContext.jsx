/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { auth, googleProvider, GoogleAuthProvider, signInWithPopup, signOut } from '../config/firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken]     = useState(() => localStorage.getItem('token'));

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
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
  }, [clearSession]);

  // Load profile on mount and whenever token changes
  useEffect(() => {
    if (token) {
      refreshProfile();
    } else {
      setLoading(false);
    }
  }, [token, refreshProfile]);

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

      return { success: true, user: userData };
    } catch (error) {
      console.error('[Auth] Google login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelled by user');
      }
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }, []);

  const loginWithGoogle   = useCallback(() => authenticateWithGoogle(), [authenticateWithGoogle]);
  const grantInboxAccess  = useCallback(() => authenticateWithGoogle(), [authenticateWithGoogle]);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
      await signOut(auth);
    } catch (error) {
      // Ignore errors during logout
      console.warn('[Auth] Logout warning:', error.message);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, token, loading, loginWithGoogle, grantInboxAccess, logout, refreshProfile }}>
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
