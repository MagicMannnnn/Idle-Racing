import { Stack } from 'expo-router'

export default function TeamLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="hq" options={{ title: 'HQ' }} />
      <Stack.Screen name="drivers" options={{ title: 'Drivers' }} />
      <Stack.Screen name="upgrades" options={{ title: 'Car Upgrades' }} />
    </Stack>
  )
}
