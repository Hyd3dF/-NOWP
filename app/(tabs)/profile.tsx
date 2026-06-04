import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Alert,
  Clipboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { usePaymentProfileStore } from '@/stores/paymentProfileStore';
import { Avatar } from '@/components/ui/Avatar';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { profile, fetchPaymentProfile } = usePaymentProfileStore();

  React.useEffect(() => {
    fetchPaymentProfile();
  }, [fetchPaymentProfile, user?.id]);

  const handleCopyOroyaId = () => {
    if (!profile?.payment_tag) return;
    Clipboard.setString(profile.payment_tag);
    Alert.alert('Copied', 'Your Oroya ID has been copied.');
  };

  const renderRow = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    opts?: { rightText?: string; destructive?: boolean; isLast?: boolean }
  ) => (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !opts?.isLast && styles.rowBorder,
        pressed && { backgroundColor: colors.light.borderLight },
      ]}
      onPress={onPress}
    >
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon}
          size={20}
          color={opts?.destructive ? colors.light.error : colors.light.textSecondary}
        />
        <Text style={[styles.rowLabel, opts?.destructive && { color: colors.light.error }]}>
          {label}
        </Text>
      </View>
      {opts?.rightText ? (
        <Text style={styles.rowRight}>{opts.rightText}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Profile Header ─── */}
        <View style={styles.profileHeader}>
          <Avatar name={user?.displayName || 'User'} uri={user?.avatarUrl} size={76} />
          <Text style={styles.name}>{user?.displayName || 'Oroya User'}</Text>
          <Text style={styles.username}>@{user?.username || 'user'}</Text>
          <Pressable
            style={({ pressed }) => [styles.idChip, pressed && { opacity: 0.7 }]}
            onPress={handleCopyOroyaId}
          >
            <Text style={styles.idText}>
              {profile?.payment_tag ? `#${profile.payment_tag}` : '—'}
            </Text>
            <Ionicons name="copy-outline" size={14} color={colors.light.primary} />
          </Pressable>
        </View>

        {/* ─── Account ─── */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          {renderRow('person-outline', 'Edit Profile', () => router.push('/profile/edit'))}
          {renderRow('shield-checkmark-outline', 'Verification', () => router.push('/profile/verification'))}
          {renderRow('wallet-outline', 'Wallet', () => router.push('/profile/payments'), { rightText: 'USD' })}
          {renderRow('lock-closed-outline', 'Security', () => router.push('/profile/security'), { isLast: true })}
        </View>

        {/* ─── Support ─── */}
        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.card}>
          {renderRow('help-circle-outline', 'Help & FAQ', () => router.push('/profile/help'))}
          {renderRow('log-out-outline', 'Log Out', () => router.push('/profile/logout'), { isLast: true })}
        </View>

        {/* ─── Footer ─── */}
        <Text style={styles.version}>Oroya v1.0.0</Text>
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
    paddingBottom: 120,
  },

  // ─── Profile Header ───
  profileHeader: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    paddingBottom: spacing['2xl'],
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.light.textPrimary,
    marginTop: spacing.md,
    letterSpacing: -0.3,
  },
  username: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.light.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.light.borderLight,
  },
  idText: {
    ...typography.caption,
    color: colors.light.primary,
    fontWeight: '700',
  },

  // ─── Sections ───
  sectionLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.light.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },

  // ─── Rows ───
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.light.borderLight,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowLabel: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  rowRight: {
    ...typography.caption,
    color: colors.light.textTertiary,
  },

  // ─── Footer ───
  version: {
    ...typography.caption,
    color: colors.light.textTertiary,
    textAlign: 'center',
    marginTop: spacing['3xl'],
  },
});
