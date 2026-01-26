import Ionicons from '@expo/vector-icons/build/Ionicons'
import { Tabs, router } from 'expo-router'
import { Pressable, Text } from 'react-native'

function SettingsButton() {
  return (
    <Pressable onPress={() => router.push('/settings')} hitSlop={10}>
      <Ionicons name="settings-outline" size={22} style={{ marginLeft: 15 }} />
    </Pressable>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerLeft: () => <SettingsButton />,
        tabBarActiveTintColor: '#000000',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
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
