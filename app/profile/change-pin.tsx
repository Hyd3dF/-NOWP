import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Alert,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { PinPad } from '@/components/ui/PinPad';

export default function ChangePinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { changePin } = useAuthStore();
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Enter Old PIN, 2: Enter New PIN, 3: Confirm New PIN
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');

  const handlePinComplete = async (pin: string) => {
    setError('');

    if (step === 1) {
      setOldPin(pin);
      setStep(2);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (step === 2) {
      setNewPin(pin);
      setStep(3);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      if (pin === newPin) {
        try {
          await changePin(oldPin, pin);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Alert.alert(
            'PIN Changed',
            'Your security PIN has been updated successfully.',
            [
              {
                text: 'OK',
                onPress: () => {
                  router.back();
                },
              },
            ]
          );
        } catch {
          setError('PIN could not be changed. Check your current PIN and try again.');
          setStep(1);
          setOldPin('');
          setNewPin('');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      } else {
        setError('PINs do not match. Restarting process.');
        setStep(2);
        setNewPin('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }
  };

  const getTitle = () => {
    switch (step) {
      case 1:
        return 'Enter Current PIN';
      case 2:
        return 'Enter New PIN';
      case 3:
        return 'Confirm New PIN';
    }
  };

  const getSubtitle = () => {
    switch (step) {
      case 1:
        return 'Confirm your identity by entering your active PIN.';
      case 2:
        return 'Create a new 4-digit PIN for authorization.';
      case 3:
        return 'Re-enter your new PIN to confirm.';
    }
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
        <Text style={styles.headerTitle}>Change PIN</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{getTitle()}</Text>
        <Text style={styles.subtitle}>{getSubtitle()}</Text>
      </View>

      <View style={styles.pinPadWrapper}>
        <PinPad
          onComplete={handlePinComplete}
          error={error}
          title={getTitle()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
    justifyContent: 'space-between',
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

  // ─── Body Header ───
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    marginTop: spacing['2xl'],
  },
  title: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  pinPadWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
});
