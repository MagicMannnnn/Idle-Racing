import { Ionicons } from '@expo/vector-icons'
import { useMoney } from '@state/useMoney'
import formatMoney from '@utils/money'
import { Text, View } from 'react-native'

export default function Money() {
  const money = useMoney((s: any) => s.money)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
      <Text>{formatMoney(money)}</Text>
      <Ionicons name="disc-outline" size={22} color="#F5C542" />
    </View>
  )
}
