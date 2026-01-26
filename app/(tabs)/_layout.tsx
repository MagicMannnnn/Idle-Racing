import { Ionicons } from '@expo/vector-icons'
import { Tabs, router } from 'expo-router'
import { Pressable, Text } from 'react-native'

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
        headerLeftContainerStyle: { paddingLeft: 0 },
        tabBarActiveTintColor: '#000000',
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          headerShown: false,
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
