import { useCallback } from 'react';

import { setApiToken } from '@/services/apiClient';
import { authService } from '@/services/authService';
import { useAuthContext } from '@/store/authStore';

export function useAuth() {
  const { token, refreshToken, user, isLoading, login, setUser, logout } = useAuthContext();

  const signIn = useCallback(
    async (email: string, password: string) => {
      const pair = await authService.login(email, password);
      setApiToken(pair.access_token);
      login(pair.access_token, pair.refresh_token);
      const me = await authService.me();
      setUser(me);
    },
    [login, setUser],
  );

  const signOut = useCallback(async () => {
    if (token) {
      await authService.logout(token).catch(() => {});
    }
    setApiToken(null);
    logout();
  }, [token, logout]);

  return { token, refreshToken, user, isLoading, signIn, signOut };
}
