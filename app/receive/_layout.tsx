import { Stack } from 'expo-router';

export default function ReceiveLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_bottom',
      }}
    />
  );
}
