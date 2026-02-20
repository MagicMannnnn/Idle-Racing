import Money from '@components/money/MoneyHeader'
import { Ionicons } from '@expo/vector-icons'
import { router, Tabs } from 'expo-router'
import { Pressable } from 'react-native'

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

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerLeft: () => <SettingsButton />,
        headerRight: () => <Money />,
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
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'My Team',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
