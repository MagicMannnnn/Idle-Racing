import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { use } from 'react'
import { useOnboarding } from '../state/useOnboarding'
import { useMoney } from '../state/useMoney'
import { useTracks } from '../state/useTracks'

export default function SettingsScreen() {
  const resetOnboarding = useOnboarding((s) => s.reset)
  const resetMoney = useMoney((s) => s.reset)
  const resetTracks = useTracks((s) => s.reset)

  function handleReset() {
    resetOnboarding()
    resetMoney()
    resetTracks()
    router.replace('/')
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Settings</Text>

      <Pressable
        onPress={handleReset}
        style={{ padding: 12, borderWidth: 1, borderRadius: 10, alignSelf: 'flex-start' }}
      >
        <Text>Reset WARNING THIS WILL RESET EVERYTHING</Text>
      </Pressable>
    </View>
  )
}
