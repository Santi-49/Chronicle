import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DammColors } from '@/constants/theme';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  success: { bg: DammColors.successLight, text: DammColors.success },
  warning: { bg: DammColors.warningLight, text: DammColors.warning },
  error: { bg: DammColors.errorLight, text: DammColors.error },
  info: { bg: DammColors.infoLight, text: DammColors.info },
  neutral: { bg: DammColors.divider, text: DammColors.textSecondary },
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const colors = variantStyles[variant];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
