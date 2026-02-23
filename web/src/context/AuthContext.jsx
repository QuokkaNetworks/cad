import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, clearToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // ignore
    } finally {
      clearToken();
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get('/api/auth/me');
      setUser(data);
    } catch (err) {
      if (err?.status === 401) {
        clearToken();
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const id = setInterval(() => {
      refreshUser();
    }, 60000);
    return () => clearInterval(id);
  }, [user, refreshUser]);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    isFiveMOnline: !!user?.is_fivem_online,
    departments: user?.departments || [],
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
