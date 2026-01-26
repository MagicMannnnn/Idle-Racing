import { Ionicons } from '@expo/vector-icons'
import { View, Text } from 'react-native'

export default function Money() {
  return (
    <View>
      <Ionicons name="disc-outline" size={18} color="#F5C542" />
      <Text>{formatMoney(7)}</Text>
    </View>
  )
}

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
