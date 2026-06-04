import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { HeaderBar } from '@/components/shared/HeaderBar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { changePassword } from '@/services/api/security';
import { ApiError } from '@/services/api/client';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const invalidateSession = useAuthStore((state) => state.invalidateSession);

  const submit = async () => {
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Fill in all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      await invalidateSession();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Password Changed', 'Please sign in again with your new password.', [
        { text: 'OK', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      if (error instanceof ApiError && error.code === 'current_password_invalid') {
        setError('Current password is incorrect. Try again.');
      } else if (error instanceof ApiError && error.code === 'weak_password') {
        setError('New password must be stronger.');
      } else {
        setError('Password could not be changed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Change Password" showBack onBack={() => router.back()} compact />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Protect your account</Text>
          <Text style={styles.subtitle}>
            Use a strong password that you do not use anywhere else.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Input
            label="Current Password"
            placeholder="Enter current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <Input
            label="New Password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <Input
            label="Confirm New Password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <Button
            title="Update Password"
            onPress={submit}
            loading={isLoading}
            fullWidth
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  title: {
    ...typography.h2,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  error: {
    ...typography.bodySm,
    color: colors.light.error,
    marginBottom: spacing.md,
  },
  button: {
    marginTop: spacing.lg,
  },
});
