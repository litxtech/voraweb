import { Stack } from 'expo-router';

export default function CityCamerasLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[cityId]" options={{ headerShown: false }} />
      <Stack.Screen name="watch/[cameraId]" options={{ headerShown: false }} />
    </Stack>
  );
}
