import { Ionicons } from '@expo/vector-icons'
import { useMoney } from '@state/useMoney'
import { useOnboarding } from '@state/useOnboarding'
import { useFonts } from 'expo-font'
import { router, SplashScreen, Stack } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, Text } from 'react-native'

// Time simulation for development/testing
if (__DEV__) {
  ;(global as any).simulateTime = (hoursAhead: number) => {
    const MS_PER_HOUR = 60 * 60 * 1000
    const originalDateNow = Date.now
    const timeOffset = hoursAhead * MS_PER_HOUR

    Date.now = function () {
      return originalDateNow() + timeOffset
    }

    // Trigger tick to apply changes
    const { useEvents } = require('../state/useEvents')
    useEvents.getState().tickOnce()

    console.log(`Simulated ${hoursAhead} hours ahead`)

    return () => {
      Date.now = originalDateNow
      console.log('Time simulation restored')
    }
  }
}

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const hasHydrated = useOnboarding((s: any) => s.hasHydrated)
  const completed = useOnboarding((s: any) => s.completed)
  const stage = useOnboarding((s: any) => s.stage)
  const set = useMoney((s: any) => s.set)

  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  })

  useEffect(() => {
    if (hasHydrated && !completed && stage === 0) set(250)
  }, [hasHydrated, completed, stage, set])

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!hasHydrated || !fontsLoaded) return null

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Settings',
          presentation: 'card',
          headerBackTitle: '',
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) router.back()
                else router.replace('/home')
              }}
              style={{ paddingHorizontal: 16 }}
              hitSlop={10}
            >
              <Text style={{ fontSize: 28, lineHeight: 28, fontWeight: '400', color: '#0B0F14' }}>
                ‹
              </Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="not-found" />
    </Stack>
  )
}
