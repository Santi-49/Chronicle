import React, { createContext, useContext, useReducer, type ReactNode } from 'react';

import type { UserWithRoles } from '@/features/auth/types';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserWithRoles | null;
  isLoading: boolean;
}

type AuthAction =
  | { type: 'LOGIN'; payload: { token: string; refreshToken: string } }
  | { type: 'SET_USER'; payload: UserWithRoles }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean };

interface AuthContextValue extends AuthState {
  login: (token: string, refreshToken: string) => void;
  setUser: (user: UserWithRoles) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN':
      return {
        ...state,
        token: action.payload.token,
        refreshToken: action.payload.refreshToken,
        isLoading: false,
      };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'LOGOUT':
      return { token: null, refreshToken: null, user: null, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    default:
      return state;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    token: null,
    refreshToken: null,
    user: null,
    isLoading: false,
  });

  const value: AuthContextValue = {
    ...state,
    login: (token, refreshToken) =>
      dispatch({ type: 'LOGIN', payload: { token, refreshToken } }),
    setUser: (user) => dispatch({ type: 'SET_USER', payload: user }),
    logout: () => dispatch({ type: 'LOGOUT' }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
}
