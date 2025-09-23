import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut as backendSignOut, restoreSession } from '../services/auth';

/**
 * Custom hook for managing email authentication state
 * Simple email-based authentication without Firebase billing requirements
 */
export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Session duration (7 days)
  const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;

  // Listen to authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged((authUser) => {
      if (authUser) {
        const email = authUser.email;
        setUser(authUser);
        setUserEmail(email);
        setIsAuthenticated(true);
        console.log('✅ [AUTH] User authenticated:', email);
      } else {
        setUser(null);
        setUserEmail(null);
        setIsAuthenticated(false);
        clearSession();
        console.log('🚪 [AUTH] User signed out');
      }
      setIsLoading(false);
    });

    // Also attempt to restore session
    const restored = restoreSession();
    if (restored) {
      setUser(restored);
      setUserEmail(restored.email);
      setIsAuthenticated(true);
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, []);

  // Login with email (handled by email auth service)
  const login = useCallback((email) => {
    try {
      // Email authentication handles the actual login
      setUserEmail(email);
      setIsAuthenticated(true);
      
      console.log('📧 [AUTH] Login successful for:', email);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }, []);

  // Logout and clear session
  const logout = useCallback(async () => {
    try {
      await backendSignOut();
    } catch (error) {
      console.error('Logout error:', error);
      setIsAuthenticated(false);
      setUserEmail(null);
      setUser(null);
      clearSession();
    }
  }, []);

  // Clear session data from localStorage
  const clearSession = useCallback(() => {
    localStorage.removeItem('emailAuth_user');
    localStorage.removeItem('emailAuth_loginTime');
  }, []);

  // Get formatted email for display
  const getFormattedEmail = useCallback(() => {
    if (!userEmail) return '';
    return userEmail.toLowerCase();
  }, [userEmail]);

  // Get display name from email
  const getDisplayName = useCallback(() => {
    if (!userEmail) return '';
    return userEmail.split('@')[0];
  }, [userEmail]);

  // Get session time remaining
  const getSessionTimeRemaining = useCallback(() => {
    const loginTime = localStorage.getItem('emailAuth_loginTime');
    if (!loginTime) return 0;
    
    const sessionAge = Date.now() - parseInt(loginTime, 10);
    const remaining = SESSION_DURATION - sessionAge;
    return Math.max(0, remaining);
  }, [SESSION_DURATION]);

  // Check if session will expire soon (within 1 day)
  const isSessionExpiringSoon = useCallback(() => {
    const remaining = getSessionTimeRemaining();
    return remaining > 0 && remaining < (24 * 60 * 60 * 1000); // 1 day
  }, [getSessionTimeRemaining]);

  return {
    isAuthenticated,
    email: userEmail, // New primary field
    userEmail, // Keep for compatibility
    phoneNumber: userEmail, // Backward compatibility alias
    user,
    isLoading,
    loading: isLoading, // Keep this alias for backward compatibility
    login,
    logout,
    getFormattedEmail,
    getDisplayName,
    getFormattedPhone: getFormattedEmail, // Alias for compatibility
    getSessionTimeRemaining,
    isSessionExpiringSoon,
    sessionDuration: SESSION_DURATION
  };
};