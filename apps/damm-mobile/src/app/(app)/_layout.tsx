import { Redirect, Slot } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';

export default function AppLayout() {
  const { token } = useAuth();

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Slot />;
}
