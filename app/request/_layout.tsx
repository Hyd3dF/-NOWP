import { Stack } from 'expo-router';

export default function RequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_bottom',
      }}
    />
  );
}
