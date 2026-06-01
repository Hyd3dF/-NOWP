import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing, borderRadius, shadows } from '@/theme/spacing';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { isValidEmail, isValidPassword } from '@/utils/validation';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithBiometrics, isLoading, biometricsEnabled } = useAuthStore();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    setGeneralError('');

    let valid = true;
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      valid = false;
    }
    if (!isValidPassword(password)) {
      setPasswordError('Password must be at least 8 characters');
      valid = false;
    }

    if (!valid) return;

    try {
      await login(email, password);
      router.replace('/(tabs)/home');
    } catch (error: any) {
      setGeneralError(getLoginErrorMessage(error));
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware) {
        setGeneralError('Biometric sign-in is not available on this device. Please use your password.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }

      if (!isEnrolled) {
        setGeneralError('Set up biometrics on this device before using biometric sign-in.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate with Face ID / Touch ID to log in',
        fallbackLabel: 'Use Password',
      });

      if (result.success) {
        await loginWithBiometrics();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.replace('/(tabs)/home');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    } catch {
      setGeneralError('No valid saved session found. Please log in with your password.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  };

  useEffect(() => {
    if (biometricsEnabled) {
      const timer = setTimeout(() => {
        handleBiometricLogin();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [biometricsEnabled]);

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
          {/* Header Brand */}
          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>O</Text>
            </View>
            <Text style={styles.brandName}>Oroya</Text>
            <Text style={styles.tagline}>Your money, simplified</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {generalError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{generalError}</Text>
              </View>
            ) : null}

            <Input
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              error={emailError}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              error={passwordError}
              secureTextEntry
              autoCapitalize="none"
            />

            <Pressable
              onPress={() =>
                Alert.alert(
                  'Reset password',
                  'Password reset is not available in the app yet. Please contact support if you need help accessing your account.',
                )
              }
              style={styles.forgotPassword}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </Pressable>

            <View style={styles.buttonRow}>
              <View style={biometricsEnabled ? styles.loginBtnContainerHalf : styles.loginBtnContainerFull}>
                <Button
                  title="Log In"
                  onPress={handleLogin}
                  loading={isLoading}
                  fullWidth
                />
              </View>
              {biometricsEnabled && (
                <Pressable
                  onPress={handleBiometricLogin}
                  style={styles.biometricBtn}
                >
                  <Ionicons name="finger-print" size={26} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Footer Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <Pressable onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.signUpLink}>Sign Up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getLoginErrorMessage(error: any) {
  const code = String(error?.code || error?.message || '');
  if (code === 'connection_failed') {
    return 'We could not connect right now. Please check your connection and try again.';
  }
  if (code === 'server_unavailable') {
    return 'Sign-in is temporarily unavailable. Please try again in a few minutes.';
  }
  if (code === 'validation_failed') {
    return 'Please check your email and password, then try again.';
  }
  return 'We could not sign you in with those details.';
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
    justifyContent: 'space-between',
    paddingBottom: spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginTop: spacing['5xl'],
    marginBottom: spacing['2xl'],
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoBadgeText: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  brandName: {
    ...typography.h1,
    fontSize: 36,
    color: colors.light.textPrimary,
    fontWeight: '800',
  },
  tagline: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
    marginTop: spacing.xs,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  errorContainer: {
    backgroundColor: colors.light.errorLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.light.error,
  },
  errorText: {
    ...typography.bodySm,
    color: colors.light.error,
    textAlign: 'center',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing['2xl'],
  },
  forgotPasswordText: {
    ...typography.caption,
    color: colors.light.primary,
    fontWeight: '600',
  },
  loginBtn: {
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    width: '100%',
  },
  loginBtnContainerFull: {
    flex: 1,
  },
  loginBtnContainerHalf: {
    flex: 1,
  },
  biometricBtn: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing['2xl'],
  },
  footerText: {
    ...typography.bodySm,
    color: colors.light.textSecondary,
  },
  signUpLink: {
    ...typography.bodySm,
    color: colors.light.primary,
    fontWeight: '600',
  },
});
