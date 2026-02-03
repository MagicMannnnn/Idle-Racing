import { Ionicons } from '@expo/vector-icons'
import { router, Stack } from 'expo-router'
import { Pressable, Text } from 'react-native'

function SettingsButton() {
  return (
    <Pressable onPress={() => router.push('/settings')} hitSlop={10} style={{}}>
      <Ionicons name="settings-outline" size={22} />
    </Pressable>
  )
}

function BackButton() {
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace('/(tabs)/home')
        }
      }}
      style={{ paddingHorizontal: 16 }}
      hitSlop={10}
    >
      <Text style={{ fontSize: 28, lineHeight: 28, fontWeight: '400', color: '#0B0F14' }}>‹</Text>
    </Pressable>
  )
}

export default function HomeLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          title: 'Tracks',
          headerLeft: () => <SettingsButton />,
        }}
      />
      <Stack.Screen
        name="track/[id]"
        options={{
          title: 'Track',
          headerShown: false,
          headerLeft: () => <BackButton />,
        }}
      />
    </Stack>
  )
}
