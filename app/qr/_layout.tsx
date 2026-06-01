import { Stack } from 'expo-router';

export default function QRLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_bottom',
      }}
    />
  );
}
