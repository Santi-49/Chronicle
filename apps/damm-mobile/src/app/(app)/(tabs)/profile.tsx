import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { Card } from '@/components/ui/Card';
import { DammColors } from '@/constants/theme';
import { ProfileCard } from '@/features/profile/components/ProfileCard';
import { useAuth } from '@/hooks/useAuth';

const INFO_ROWS = [
  { label: 'Empresa', value: 'Grupo Damm', symbol: 'building.2' },
  { label: 'Zona', value: 'Barcelona — Zona Norte', symbol: 'map' },
  { label: 'Región', value: 'Cataluña', symbol: 'location' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Estás seguro de que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Perfil</Text>

        <ProfileCard user={user} />

        <Card style={styles.infoCard} padding={0}>
          {INFO_ROWS.map((row, i) => (
            <View
              key={row.label}
              style={[styles.infoRow, i < INFO_ROWS.length - 1 && styles.infoRowBorder]}>
              <SymbolView name={row.symbol as any} size={18} tintColor={DammColors.primary} />
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card padding={14}>
          <View style={styles.versionRow}>
            <SymbolView name="info.circle" size={18} tintColor={DammColors.textMuted} />
            <Text style={styles.versionText}>Damm Field v1.0.0</Text>
          </View>
        </Card>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <SymbolView
            name="rectangle.portrait.and.arrow.right"
            size={18}
            tintColor={DammColors.error}
          />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: DammColors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: DammColors.text,
    letterSpacing: -0.5,
    paddingVertical: 4,
  },
  infoCard: {
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DammColors.border,
  },
  infoText: {
    flex: 1,
    gap: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: DammColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: DammColors.text,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  versionText: {
    fontSize: 14,
    color: DammColors.textSecondary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: DammColors.errorLight,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: DammColors.error,
  },
});
