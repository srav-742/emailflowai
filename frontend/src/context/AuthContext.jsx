/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { auth, googleProvider, GoogleAuthProvider, signInWithPopup, signOut } from '../config/firebase';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const refreshProfile = useCallback(async () => {
    try {
      const response = await authAPI.getProfile();
      setUser(response.data.user);
    } catch (error) {
      console.error('Failed to fetch profile:', error);
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      refreshProfile();
    } else {
      setLoading(false);
    }
  }, [refreshProfile, token]);

  const authenticateWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const idToken = await firebaseUser.getIdToken();
      const googleCredential = GoogleAuthProvider.credentialFromResult(result);
      const googleAccessToken = googleCredential?.accessToken || null;
      const response = await authAPI.firebaseLogin(idToken, googleAccessToken);
      const { token: jwtToken, user: userData } = response.data;
      localStorage.setItem('token', jwtToken);
      setToken(jwtToken);
      setUser(userData);

      return { success: true, user: userData };
    } catch (error) {
      console.error('Google login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelled by user');
      }
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }
      throw error;
    }
  }, []);

  const loginWithGoogle = useCallback(async () => authenticateWithGoogle(), [authenticateWithGoogle]);
  const grantInboxAccess = useCallback(async () => authenticateWithGoogle(), [authenticateWithGoogle]);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, token, loading, loginWithGoogle, grantInboxAccess, logout, refreshProfile }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
