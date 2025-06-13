// frontend/src/contexts/AuthContext.js
import React, { createContext, useContext, useEffect } from 'react';
// Zustand auth store selectors & actions
import {
  useAuthUser,
  useIsAuthenticated,
  useAuthLoading,
  useAuthError,
  useAuthActions,
  useAuthStore,
} from '../stores/authStore'; // adjust path if different

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  // Zustand selectors
  const user = useAuthUser();
  const isAuthenticated = useIsAuthenticated();
  const loading = useAuthLoading();
  const error = useAuthError();
  const { login, register, logout, verifyAuth } = useAuthActions();

  // On mount, verify existing auth (tokens from storage)
  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    isAuthenticated,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
