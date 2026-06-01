import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';

export default function Index() {
  const { isAuthenticated, isInitialized, initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, []);

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.light.primary} />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.light.background,
  },
});
