import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Card } from '@/components/ui/Card';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { biometricsEnabled, setBiometricsEnabled } = useAuthStore();
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const handleBiometricsToggle = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!val) {
      setBiometricsEnabled(false);
      return;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometrics Unavailable',
          'Set up Face ID or fingerprint unlock on this device, then try again.'
        );
        setBiometricsEnabled(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm identity to enable Biometric Login',
        fallbackLabel: 'Use PIN',
      });

      if (result.success) {
        setBiometricsEnabled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Biometrics Enabled',
          'You can now use Face ID / Touch ID to authorize transactions.'
        );
      } else {
        setBiometricsEnabled(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    } catch {
      setBiometricsEnabled(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('Biometrics Not Enabled', 'We could not confirm biometric access. Please try again.');
    }
  };

  const handle2FAToggle = (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTwoFactorEnabled(val);
    if (val) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Two-Factor Authentication',
        'Two-factor authentication will protect sensitive account actions.'
      );
    }
  };

  const handleAction = (label: string) => {
    Alert.alert(label, 'For your security, please confirm this change from your account settings.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <HeaderBar title="Security Settings" showBack onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Authentication</Text>
        <Card variant="default" style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="finger-print" size={22} color={colors.light.primary} />
              <View>
                <Text style={styles.rowTitle}>Biometric Lock</Text>
                <Text style={styles.rowSubtitle}>Unlock app with Face ID / Fingerprint</Text>
              </View>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={handleBiometricsToggle}
              trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
              thumbColor={biometricsEnabled ? colors.light.primary : '#F4F3F4'}
            />
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="shield-checkmark" size={22} color={colors.light.primary} />
              <View>
                <Text style={styles.rowTitle}>Two-Factor Authentication</Text>
                <Text style={styles.rowSubtitle}>Request OTP code for transfers</Text>
              </View>
            </View>
            <Switch
              value={twoFactorEnabled}
              onValueChange={handle2FAToggle}
              trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
              thumbColor={twoFactorEnabled ? colors.light.primary : '#F4F3F4'}
            />
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Credentials</Text>
        <Card variant="default" style={styles.card}>
          <Pressable style={styles.pressableRow} onPress={() => router.push('/profile/change-pin')}>
            <View style={styles.rowLeft}>
              <Ionicons name="key" size={22} color={colors.light.primary} />
              <View>
                <Text style={styles.rowTitle}>Change Security PIN</Text>
                <Text style={styles.rowSubtitle}>Update your 4-digit code</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>
          <View style={styles.divider} />

          <Pressable style={styles.pressableRow} onPress={() => handleAction('Change Password')}>
            <View style={styles.rowLeft}>
              <Ionicons name="lock-closed" size={22} color={colors.light.primary} />
              <View>
                <Text style={styles.rowTitle}>Change Password</Text>
                <Text style={styles.rowSubtitle}>Choose a stronger login password</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
          </Pressable>
        </Card>

        <Text style={styles.sectionTitle}>Devices</Text>
        <Card variant="default" style={styles.card}>
          <View style={styles.pressableRow}>
            <View style={styles.rowLeft}>
              <Ionicons name="phone-portrait-outline" size={22} color={colors.light.primary} />
              <View>
                <Text style={styles.rowTitle}>Current Device</Text>
                <Text style={styles.rowSubtitle}>Current session</Text>
              </View>
            </View>
            <Text style={styles.badgeText}>This Device</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.light.textPrimary,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  card: {
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  pressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '600',
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.light.borderLight,
  },
  badgeText: {
    ...typography.caption,
    color: colors.light.success,
    backgroundColor: colors.light.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
