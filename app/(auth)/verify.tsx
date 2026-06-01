import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import * as Haptics from 'expo-haptics';

export default function VerifyOtpScreen() {
  const user = useAuthStore((s) => s.user);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setCodeError('');
    if (code.length !== 6) {
      setCodeError('Please enter the 6-digit code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }

    setLoading(true);
    try {
      await Promise.resolve();
      setCodeError('We could not verify this code right now. Please request a new code and try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.brandName}>Verify Code</Text>
            <Text style={styles.tagline}>
              We sent a 6-digit confirmation code to your phone number and email {maskEmail(user?.email)}.
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Enter Code"
              placeholder="Enter 6-digit code"
              value={code}
              onChangeText={(val) => setCode(val.replace(/[^0-9]/g, '').slice(0, 6))}
              error={codeError}
              keyboardType="number-pad"
              autoFocus
            />

            <Button
              title="Verify Code"
              onPress={handleVerify}
              loading={loading}
              fullWidth
              style={styles.verifyBtn}
            />

            <Button
              title="Resend Code"
              onPress={() =>
                Alert.alert(
                  'Request received',
                  'If your details are correct, a new verification code will be sent shortly.',
                )
              }
              variant="outline"
              fullWidth
              style={styles.resendBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function maskEmail(email?: string) {
  if (!email) return 'your email address';

  const [name, domain] = email.split('@');
  if (!name || !domain) return 'your email address';

  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    justifyContent: 'center',
    paddingBottom: spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing['2xl'],
  },
  brandName: {
    ...typography.h1,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  tagline: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  form: {
    width: '100%',
  },
  verifyBtn: {
    marginTop: spacing.md,
  },
  resendBtn: {
    marginTop: spacing.md,
  },
});
