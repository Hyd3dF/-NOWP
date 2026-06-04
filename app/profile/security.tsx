import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/authStore';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { PinPad } from '@/components/ui/PinPad';
import {
  fetchSecurityOverview,
  SecurityOverview,
  updateBiometricLock,
  updateTwoFactor,
} from '@/services/api/security';

export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { biometricsEnabled, setBiometricsEnabled } = useAuthStore();
  const [security, setSecurity] = useState<SecurityOverview | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [isSavingBiometric, setIsSavingBiometric] = useState(false);
  const [isSaving2FA, setIsSaving2FA] = useState(false);
  const [pinRequest, setPinRequest] = useState<{
    title: string;
    resolve: (pin: string | null) => void;
  } | null>(null);
  const [pinPadKey, setPinPadKey] = useState(0);

  useEffect(() => {
    fetchSecurityOverview()
      .then((overview) => {
        setSecurity(overview);
        setTwoFactorEnabled(overview.twoFactor.enabled);
        if (overview.biometricLock.enabled !== biometricsEnabled) {
          setBiometricsEnabled(overview.biometricLock.enabled);
        }
      })
      .catch(() => {});
  }, []);

  const handleBiometricsToggle = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const pin = await requestSecurityPin('Confirm Security PIN');
    if (!pin) return;

    if (!val) {
      setIsSavingBiometric(true);
      try {
        await updateBiometricLock(false, pin);
        await setBiometricsEnabled(false);
      } finally {
        setIsSavingBiometric(false);
      }
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
        setIsSavingBiometric(true);
        try {
          await updateBiometricLock(true, pin);
          await setBiometricsEnabled(true);
        } finally {
          setIsSavingBiometric(false);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Biometrics Enabled',
          'Oroya will lock when the app goes to the background and ask for Face ID / fingerprint when you return.'
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

  const handle2FAToggle = async (val: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const pin = await requestSecurityPin('Confirm Security PIN');
    if (!pin) return;

    const previous = twoFactorEnabled;
    setTwoFactorEnabled(val);
    setIsSaving2FA(true);
    try {
      const updated = await updateTwoFactor(val, pin);
      setTwoFactorEnabled(updated.enabled);
      if (val) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Alert.alert(
          'Two-Factor Authentication',
          'Two-factor settings are now saved on your account.'
        );
      }
    } catch {
      setTwoFactorEnabled(previous);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert('Two-Factor Authentication', 'We could not update this setting. Please try again.');
    } finally {
      setIsSaving2FA(false);
    }
    if (val) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  const requestSecurityPin = (title: string) => {
    setPinPadKey((key) => key + 1);
    return new Promise<string | null>((resolve) => {
      setPinRequest({ title, resolve });
    });
  };

  const closePinPrompt = (pin: string | null) => {
    const request = pinRequest;
    setPinRequest(null);
    request?.resolve(pin);
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Security Settings" showBack onBack={() => router.back()} compact />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Authentication */}
        <Text style={styles.sectionLabel}>Authentication</Text>
        
        {/* Biometrics */}
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="finger-print-outline" size={20} color={colors.light.textSecondary} />
            <View style={styles.rowTexts}>
              <Text style={styles.rowTitle}>Biometric Lock</Text>
              <Text style={styles.rowSubtitle}>Unlock app with Face ID / Fingerprint</Text>
            </View>
          </View>
          <Switch
            value={biometricsEnabled}
            onValueChange={handleBiometricsToggle}
            disabled={isSavingBiometric}
            trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
            thumbColor={biometricsEnabled ? colors.light.primary : '#F4F3F4'}
          />
        </View>

        {/* 2FA */}
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.light.textSecondary} />
            <View style={styles.rowTexts}>
              <Text style={styles.rowTitle}>Two-Factor Authentication</Text>
              <Text style={styles.rowSubtitle}>Request OTP code for transfers</Text>
            </View>
          </View>
          <Switch
            value={twoFactorEnabled}
            onValueChange={handle2FAToggle}
            disabled={isSaving2FA}
            trackColor={{ false: colors.light.border, true: colors.light.primaryLight }}
            thumbColor={twoFactorEnabled ? colors.light.primary : '#F4F3F4'}
          />
        </View>

        {/* Credentials */}
        <Text style={styles.sectionLabel}>Credentials</Text>
        
        {/* PIN */}
        <Pressable
          style={({ pressed }) => [
            styles.row,
            pressed && { backgroundColor: colors.light.borderLight },
          ]}
          onPress={() => router.push('/profile/change-pin')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="key-outline" size={20} color={colors.light.textSecondary} />
            <View style={styles.rowTexts}>
              <Text style={styles.rowTitle}>Change Security PIN</Text>
              <Text style={styles.rowSubtitle}>Update your 4-digit code</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
        </Pressable>

        {/* Password */}
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { borderBottomWidth: 0 },
            pressed && { backgroundColor: colors.light.borderLight },
          ]}
          onPress={() => router.push('/profile/change-password')}
        >
          <View style={styles.rowLeft}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.light.textSecondary} />
            <View style={styles.rowTexts}>
              <Text style={styles.rowTitle}>Change Password</Text>
              <Text style={styles.rowSubtitle}>Choose a stronger login password</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.light.textTertiary} />
        </Pressable>

        {/* Devices */}
        <Text style={styles.sectionLabel}>Devices</Text>
        
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowLeft}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.light.textSecondary} />
            <View style={styles.rowTexts}>
              <Text style={styles.rowTitle}>Current Device</Text>
              <Text style={styles.rowSubtitle}>
                {security?.devices.find((device) => device.isCurrent)?.platform || 'Current session'}
              </Text>
            </View>
          </View>
          <Text style={styles.badgeText}>This Device</Text>
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(pinRequest)}
        transparent={false}
        animationType="slide"
        onRequestClose={() => closePinPrompt(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => closePinPrompt(null)}
              style={({ pressed }) => [styles.modalBackButton, pressed && { opacity: 0.7 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={24} color={colors.light.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{pinRequest?.title || 'Confirm Security PIN'}</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.modalContent}>
            <Text style={styles.modalSubtitle}>
              Please enter your 4-digit security PIN to confirm identity.
            </Text>
            <View style={styles.modalPinPadWrapper}>
              <PinPad
                key={pinPadKey}
                onComplete={(pin) => closePinPrompt(pin)}
                error=""
                title=""
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
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
    paddingTop: spacing.xs,
    paddingBottom: spacing['2xl'],
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.light.textTertiary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.borderLight,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowTexts: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodySm,
    color: colors.light.textPrimary,
    fontWeight: '500',
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.light.textTertiary,
    marginTop: 2,
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
  modalContainer: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.light.background,
  },
  modalBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.light.textPrimary,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  modalSubtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  modalPinPadWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
});
