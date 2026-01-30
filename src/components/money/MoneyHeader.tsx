import { Ionicons } from '@expo/vector-icons'
import { View, Text } from 'react-native'
import { useMoney } from '../../state/useMoney'

export default function Money() {
  const money = useMoney((s) => s.money)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
      <Text>{formatMoney(money)}</Text>
      <Ionicons name="disc-outline" size={22} color="#F5C542" />
    </View>
  )
}

export function formatMoney(n: number) {
  if (n >= 1_000_000_000_000_000) return `${(n / 1_000_000_000_000_000).toFixed(1)}Q`
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
