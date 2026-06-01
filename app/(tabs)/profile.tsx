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
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { profile, fetchPaymentProfile } = usePaymentProfileStore();

  React.useEffect(() => {
    fetchPaymentProfile();
  }, [fetchPaymentProfile, user?.id]);

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

  const handleCopyOroyaId = () => {
    if (!profile?.payment_tag) return;
    Clipboard.setString(profile.payment_tag);
    Alert.alert('Copied', 'Your Oroya ID has been copied.');
  };

  const renderSettingItem = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    rightContent?: React.ReactNode
  ) => (
    <Pressable style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingLeft}>
        <View style={styles.settingIconBg}>
          <Ionicons name={icon} size={20} color={colors.light.primary} />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {rightContent !== undefined ? (
        rightContent
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <HeaderBar title="Profile" />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeaderCard}>
          <Avatar name={user?.displayName || 'User'} uri={user?.avatarUrl} size={72} />
          <Text style={styles.profileName}>{user?.displayName || 'Oroya User'}</Text>
          <Text style={styles.profileUsername}>@{user?.username || 'user'}</Text>
          <Pressable style={styles.oroyaIdBox} onPress={handleCopyOroyaId}>
            <View>
              <Text style={styles.oroyaIdLabel}>Oroya ID</Text>
              <Text style={styles.oroyaIdValue}>
                {profile?.payment_tag ? `#${profile.payment_tag}` : 'Not available'}
              </Text>
            </View>
            <Ionicons name="copy-outline" size={18} color={colors.light.primary} />
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.sectionCard}>
          {renderSettingItem('person-outline', 'Edit Profile', () => router.push('/profile/edit'))}
          <View style={styles.divider} />
          {renderSettingItem('shield-checkmark-outline', 'Identity Verification', () => router.push('/profile/verification'))}
          <View style={styles.divider} />
          {renderSettingItem(
            'wallet-outline',
            'Wallet Settings',
            () => router.push('/profile/payments'),
            <Text style={styles.settingRightText}>USD</Text>
          )}
          <View style={styles.divider} />
          {renderSettingItem('lock-closed-outline', 'Security', () => router.push('/profile/security'))}
        </View>

        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.sectionCard}>
          {renderSettingItem('help-circle-outline', 'Help & FAQ', () => router.push('/profile/help'))}
        </View>

        <Button
          title="Log Out"
          onPress={handleLogout}
          variant="outline"
          style={styles.logoutBtn}
        />
        <Text style={styles.versionText}>Oroya v1.0.0</Text>
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
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  profileHeaderCard: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  profileName: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  profileUsername: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  oroyaIdBox: {
    width: '100%',
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.light.border,
    backgroundColor: colors.light.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  oroyaIdLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
  },
  oroyaIdValue: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '800',
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.light.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  settingIconBg: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F0EDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  settingRightText: {
    ...typography.bodySm,
    color: colors.light.textTertiary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
  logoutBtn: {
    marginTop: spacing['2xl'],
    borderColor: colors.light.error,
    backgroundColor: 'transparent',
  },
  versionText: {
    ...typography.caption,
    color: colors.light.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
