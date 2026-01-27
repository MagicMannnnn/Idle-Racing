import { Stack } from 'expo-router'

export default function MapLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: 'Map',
        }}
      />
      <Stack.Screen name="track/[id]" options={{ title: 'Track', headerShown: false }} />
    </Stack>
  )
}
