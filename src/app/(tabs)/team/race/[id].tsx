import { router } from 'expo-router'
import { useEffect } from 'react'
import { View } from 'react-native'

export default function TeamRaceView() {
  // Redirect to the new race tab
  useEffect(() => {
    router.replace('/(tabs)/race')
  }, [])

  return <View />
}
