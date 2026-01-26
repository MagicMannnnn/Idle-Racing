import { useLocalSearchParams } from 'expo-router'
import { View, Text } from 'react-native'

export default function TrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Track: {id}</Text>
      <Text>track details here</Text>
    </View>
  )
}
