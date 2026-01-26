import { Ionicons } from '@expo/vector-icons'
import { router, Stack } from 'expo-router'
import { Pressable } from 'react-native'

function SettingsButton() {
  return (
    <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={{}}>
      <Ionicons name="settings-outline" size={22} />
    </Pressable>
  )
}

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Tracks',
          headerLeft: () => <SettingsButton />,
        }}
      />
      <Stack.Screen name="track/[id]" options={{ title: 'Track' }} />
    </Stack>
  )
}
