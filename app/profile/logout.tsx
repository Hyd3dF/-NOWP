import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';

export default function LogoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out of Oroya?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* ─── Header ─── */}
      <View style={[styles.headerContainer, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Account Access</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Info Section */}
        <Text style={styles.sectionLabel}>Active Session</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.infoLabel}>Account Name</Text>
            <Text style={styles.infoValue}>{user?.displayName || 'Oroya User'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.infoLabel}>Username</Text>
            <Text style={styles.infoValue}>@{user?.username || 'user'}</Text>
          </View>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Session Status</Text>
            <Text style={[styles.infoValue, { color: colors.light.success }]}>Active</Text>
          </View>
        </View>
        <Text style={styles.footerHelpText}>
          This session is secured with your biometric data and PIN.
        </Text>

        {/* Actions Section */}
        <Text style={styles.sectionLabel}>Log Out Options</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              { borderBottomWidth: 0 },
              pressed && { backgroundColor: colors.light.borderLight },
            ]}
            onPress={handleLogout}
          >
            <View style={styles.rowLeft}>
              <Ionicons name="log-out-outline" size={20} color={colors.light.error} />
              <Text style={[styles.rowTitle, { color: colors.light.error }]}>Log Out of Device</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>
        </View>
        <Text style={styles.footerHelpText}>
          Logging out will clear all active wallet syncs on this device. Make sure you remember your credentials and PIN.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },

  // ─── Header ───
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },

  // ─── Sections ───
  sectionLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },

  // ─── Card & Rows ───
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  infoLabel: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  infoValue: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  footerHelpText: {
    ...typography.caption,
    color: colors.light.textTertiary,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
});
