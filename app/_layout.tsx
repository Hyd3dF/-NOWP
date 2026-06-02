import React, { useEffect } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const { isAuthenticated, isInitialized, biometricsEnabled, initAuth } = useAuthStore();
  const [isAppLocked, setIsAppLocked] = React.useState(false);
  const rootSegment = segments[0];

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    if (isInitialized && isAuthenticated && biometricsEnabled) {
      setIsAppLocked(true);
    }
  }, [biometricsEnabled, isAuthenticated, isInitialized]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (isAuthenticated && biometricsEnabled) setIsAppLocked(true);
      }
    });

    return () => subscription.remove();
  }, [biometricsEnabled, isAuthenticated]);

  const unlockApp = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Oroya',
        fallbackLabel: 'Use device passcode',
      });
      if (result.success) setIsAppLocked(false);
    } catch {
      setIsAppLocked(true);
    }
  };

  useEffect(() => {
    if (!rootNavigationState?.key || !isInitialized) return;

    const isAuthRoute = rootSegment === '(auth)';
    const isPublicRoute = isAuthRoute || rootSegment === 'onboarding';

    if (!isAuthenticated && !isPublicRoute) {
      router.replace('/onboarding');
      return;
    }

    if (isAuthenticated && isPublicRoute) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isInitialized, rootNavigationState?.key, rootSegment, router]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="dark" />
      {!isInitialized ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.light.primary} />
        </View>
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="send" options={{ presentation: 'modal' }} />
          <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
          <Stack.Screen name="deposit" />
          <Stack.Screen name="withdrawal" />
          <Stack.Screen name="request" options={{ presentation: 'modal' }} />
          <Stack.Screen name="qr" options={{ presentation: 'modal' }} />
          <Stack.Screen name="chat" />
          <Stack.Screen name="notifications" />
        </Stack>
      )}
      {isInitialized && isAuthenticated && biometricsEnabled && isAppLocked ? (
        <View style={styles.lockOverlay}>
          <View style={styles.lockIcon}>
            <Text style={styles.lockIconText}>O</Text>
          </View>
          <Text style={styles.lockTitle}>Oroya is locked</Text>
          <Text style={styles.lockText}>Use Face ID or fingerprint to continue.</Text>
          <Pressable style={styles.unlockButton} onPress={unlockApp}>
            <Text style={styles.unlockButtonText}>Unlock</Text>
          </Pressable>
        </View>
      ) : null}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.background,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.light.background,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.primary,
    marginBottom: 18,
  },
  lockIconText: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  lockTitle: {
    color: colors.light.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  lockText: {
    color: colors.light.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  unlockButton: {
    height: 52,
    minWidth: 180,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.primary,
    marginTop: 24,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
