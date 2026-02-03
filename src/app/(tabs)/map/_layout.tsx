import { router, Stack } from 'expo-router'
import { Pressable, Text } from 'react-native'

function BackButton() {
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back()
        } else {
          router.replace('/(tabs)/map')
        }
      }}
      style={{ paddingHorizontal: 16 }}
      hitSlop={10}
    >
      <Text style={{ fontSize: 28, lineHeight: 28, fontWeight: '400', color: '#0B0F14' }}>‹</Text>
    </Pressable>
  )
}

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
