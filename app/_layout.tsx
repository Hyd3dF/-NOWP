import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="send" options={{ presentation: 'modal' }} />
        <Stack.Screen name="receive" options={{ presentation: 'modal' }} />
        <Stack.Screen name="deposit" />
        <Stack.Screen name="request" options={{ presentation: 'modal' }} />
        <Stack.Screen name="qr" options={{ presentation: 'modal' }} />
        <Stack.Screen name="chat" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
