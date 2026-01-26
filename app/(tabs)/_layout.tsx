import { Ionicons } from '@expo/vector-icons'
import { Tabs, router } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

function SettingsButton() {
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={10}
      style={{ marginLeft: 16, marginBottom: 6 }}
    >
      <Ionicons name="settings-outline" size={22} />
    </Pressable>
  )
}

function Money({ value }: { value: number }) {
  return (
    <View>
      <Ionicons name="disc-outline" size={18} color="#F5C542" />
      <Text>{formatMoney(value)}</Text>
    </View>
  )
}

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerLeft: () => <SettingsButton />,
        headerRight: () => <Money value={12345} />,
        tabBarActiveTintColor: '#000000',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Tracks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
