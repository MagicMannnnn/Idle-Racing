import { useLocalSearchParams, router } from 'expo-router'
import { View, Text, Pressable, StyleSheet } from 'react-native'

export default function TrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()

  return (
    <View style={styles.screen}>
      {/* Back button */}
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
        <Text style={styles.backIcon}>‹</Text>
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      {/* Content */}
      <Text style={styles.title}>Track: {id}</Text>
      <Text style={styles.body}>Track details here</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 16,
    gap: 12,
    backgroundColor: '#F6F7FB',
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  backIcon: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '400',
    color: '#0B0F14',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0B0F14',
  },

  title: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: '700',
    color: '#0B0F14',
  },
  body: {
    fontSize: 16,
    color: 'rgba(11,15,20,0.7)',
  },
})
