import { Stack } from 'expo-router'
import { useOnboarding } from '../state/useOnboarding'
import { useMoney } from '../state/useMoney'
import { useTracks } from '../state/useTracks'

export default function RootLayout() {
  const hasHydrated = useOnboarding((s: any) => s.hasHydrated)
  if (!hasHydrated) {
    return null
  }
  const completed = useOnboarding((s: any) => s.completed)
  const stage = useOnboarding((s: any) => s.stage)
  const set = useMoney((s: any) => s.set)

  if (!completed) {
    if (stage === 0) {
      set(250)
    }
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      <Stack.Screen
        name="settings"
        options={{
          title: 'Settings',
          presentation: 'card',
          headerBackTitle: 'Back',
        }}
      />
    </Stack>
  )
}
