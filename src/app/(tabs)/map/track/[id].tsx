import { TrackMapView } from '@/src/components/maps/TrackMapView'
import { useTracks } from '@/src/state/useTracks'
import { useLocalSearchParams, router } from 'expo-router'
import React from 'react'
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native'

export default function MapTrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const track = useTracks((s) => s.tracks.find((t) => t.id === id))

  if (!track) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.pageTitle}>Track not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>{track.name}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <TrackMapView
          trackId={track.id}
          sizePx={300}
          initialGridSize={5 + track.index * 2}
          capacity={track.capacity}
          maxCapacity={track.maxCapacity}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  backIcon: {
    fontSize: 28,
    color: '#0B0F14',
    fontWeight: '600',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0B0F14',
  },
  header: {
    gap: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0B0F14',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
