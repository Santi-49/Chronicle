import type { TokenPair, UserWithRoles } from '@/features/auth/types';
import { apiClient } from './apiClient';

export const authService = {
  login: (email: string, password: string) =>
    apiClient.post<TokenPair>('/auth/login', { email, password }),

  me: () => apiClient.get<UserWithRoles>('/auth/me'),

  logout: (accessToken: string) =>
    apiClient.postWithToken<void>('/auth/logout', accessToken),

  refresh: (refreshToken: string) =>
    apiClient.postWithToken<TokenPair>('/auth/refresh', refreshToken),
};
