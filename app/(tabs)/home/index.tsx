import { router } from 'expo-router'
import { FlatList, Pressable, Text, View } from 'react-native'

type Track = { id: string; name: string; rating: number }

const TRACKS: Track[] = [
  { id: 'track', name: 'track1', rating: 1.0 },
  { id: 'track2', name: 'track2', rating: 1.5 },
]

export default function Tracks() {
  return (
    <FlatList
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={TRACKS}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/home/track/${item.id}`)}
          style={{
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ fontSize: 16 }}>⭐ {item.rating.toFixed(1)}</Text>
          </View>
        </Pressable>
      )}
    />
  )
}
