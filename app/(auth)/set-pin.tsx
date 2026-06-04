import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { PinPad } from '@/components/ui/PinPad';

export default function SetPinScreen() {
  const router = useRouter();
  const { setPin } = useAuthStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState('');

  const handlePinComplete = (pin: string) => {
    setError('');
    if (step === 1) {
      setFirstPin(pin);
      setStep(2);
    } else {
      if (pin === firstPin) {
        setPin(pin);
        router.replace('/(tabs)/home');
      } else {
        setError('PINs do not match. Try again.');
        setStep(1);
        setFirstPin('');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {step === 1 ? 'Set secure PIN' : 'Confirm PIN'}
        </Text>
        <Text style={styles.subtitle}>
          {step === 1
            ? 'Create a 4-digit PIN to authorize transfers and log in'
            : 'Re-enter your 4-digit PIN to confirm'}
        </Text>
      </View>

      <View style={styles.pinPadContainer}>
        <PinPad
          onComplete={handlePinComplete}
          error={error}
          title=""
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
    marginTop: spacing['3xl'],
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
  pinPadContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});
