import { Ionicons } from '@expo/vector-icons'
import { View, Text } from 'react-native'
import { useMoney } from '../../state/useMoney'
import { BN, type BigNum } from '@/src/utils/bignum'

export default function Money() {
  const money = useMoney((s: any) => s.money)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
      <Text>{formatMoney(money)}</Text>
      <Ionicons name="disc-outline" size={22} color="#F5C542" />
    </View>
  )
}

export function formatMoney(n: BigNum) {
  const num = BN.from(n)

  if (num.gte(1e30)) return `${num.div(1e30).toFixed(1)}D`
  if (num.gte(1e27)) return `${num.div(1e27).toFixed(1)}N`
  if (num.gte(1e24)) return `${num.div(1e24).toFixed(1)}O`
  if (num.gte(1e21)) return `${num.div(1e21).toFixed(1)}S`
  if (num.gte(1e18)) return `${num.div(1e18).toFixed(1)}Q`
  if (num.gte(1e15)) return `${num.div(1e15).toFixed(1)}q`
  if (num.gte(1e12)) return `${num.div(1e12).toFixed(1)}T`
  if (num.gte(1e9)) return `${num.div(1e9).toFixed(1)}B`
  if (num.gte(1e6)) return `${num.div(1e6).toFixed(1)}M`
  if (num.gte(1e3)) return `${num.div(1e3).toFixed(1)}K`
  return num.floor().toString()
}
