import React, { useEffect } from 'react';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const { isAuthenticated, isInitialized, initAuth } = useAuthStore();
  const rootSegment = segments[0];

  useEffect(() => {
    initAuth();
  }, [initAuth]);

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
        </Stack>
      )}
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
});
