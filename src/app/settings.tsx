import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'

export default function SettingsScreen() {
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Settings</Text>

      <Pressable
        onPress={() => router.back()}
        style={{ padding: 12, borderWidth: 1, borderRadius: 10, alignSelf: 'flex-start' }}
      >
        <Text>Close</Text>
      </Pressable>
    </View>
  )
}
