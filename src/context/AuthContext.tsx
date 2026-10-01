import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AccessPolicy } from '../types';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: string;
  userType: 'local' | 'ad';
  policyId?: string;
  groupIds?: string[];
  isBuiltin?: boolean;
  status?: 'active' | 'disabled';
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  effectivePolicy: AccessPolicy | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: AuthUser, rememberMe?: boolean, policy?: AccessPolicy) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshEffectivePolicy: () => Promise<AccessPolicy | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'nettopology_auth_token_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [effectivePolicy, setEffectivePolicy] = useState<AccessPolicy | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Authenticate session via backend PostgreSQL token verification
  const checkAuth = useCallback(async () => {
    try {
      const storedToken =
        sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!storedToken) {
        setUser(null);
        setEffectivePolicy(null);
        setToken(null);
        setIsLoading(false);
        return;
      }

      // Verify token with backend PostgreSQL database
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setEffectivePolicy(data.effectivePolicy || null);
          setToken(storedToken);
          setIsLoading(false);
          return;
        }
      }

      // If token verification was rejected by server, purge invalid session
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem('nettopology_auth_user_v1');
      sessionStorage.removeItem('nettopology_auth_user_v1');
      setUser(null);
      setEffectivePolicy(null);
      setToken(null);
    } catch (e) {
      console.warn('[Auth] Server verification check deferred:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const refreshEffectivePolicy = useCallback(async (): Promise<AccessPolicy | null> => {
    const currentToken =
      token ||
      sessionStorage.getItem(TOKEN_STORAGE_KEY) ||
      localStorage.getItem(TOKEN_STORAGE_KEY);

    if (!currentToken) return null;

    try {
      const res = await fetch('/api/auth/effective-policy', {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.effectivePolicy) {
          setEffectivePolicy(data.effectivePolicy);
          return data.effectivePolicy;
        }
      }
    } catch (err) {
      console.error('[Auth] Failed to refresh effective policy from database', err);
    }
    return null;
  }, [token]);

  const login = (
    newToken: string,
    newUser: AuthUser,
    rememberMe: boolean = false,
    policy?: AccessPolicy
  ) => {
    setToken(newToken);
    setUser(newUser);
    if (policy) {
      setEffectivePolicy(policy);
    }

    // Persist only the cryptographic bearer token, never plain user or permissions
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_STORAGE_KEY, newToken);

    // Remove obsolete unencrypted user objects if any existed from prior versions
    localStorage.removeItem('nettopology_auth_user_v1');
    sessionStorage.removeItem('nettopology_auth_user_v1');

    if (rememberMe) {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    // Fetch authoritative database policy immediately if not provided
    if (!policy) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${newToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.effectivePolicy) {
            setEffectivePolicy(data.effectivePolicy);
          }
        })
        .catch(() => {});
    }
  };

  const logout = async () => {
    try {
      const currentToken =
        token ||
        sessionStorage.getItem(TOKEN_STORAGE_KEY) ||
        localStorage.getItem(TOKEN_STORAGE_KEY);

      if (currentToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }).catch(() => {});
      }
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem('nettopology_auth_user_v1');
      sessionStorage.removeItem('nettopology_auth_user_v1');
      setUser(null);
      setEffectivePolicy(null);
      setToken(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        effectivePolicy,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        checkAuth,
        refreshEffectivePolicy,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
