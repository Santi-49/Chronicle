import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DammColors } from '@/constants/theme';
import type { UserWithRoles } from '@/features/auth/types';

interface ProfileCardProps {
  user: UserWithRoles;
}

export function ProfileCard({ user }: ProfileCardProps) {
  const initials = `${user.name[0] ?? ''}${user.surname[0] ?? ''}`.toUpperCase();
  const displayRole = user.roles[0] ?? 'Agente';

  return (
    <Card style={styles.card} padding={20}>
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{user.name} {user.surname}</Text>
          <Text style={styles.email}>{user.email}</Text>
          <Badge label={displayRole} variant="info" />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {},
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DammColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: DammColors.textOnPrimary,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: DammColors.text,
  },
  email: {
    fontSize: 13,
    color: DammColors.textSecondary,
    marginBottom: 4,
  },
});
