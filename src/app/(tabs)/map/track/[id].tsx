import { TrackMapEditor } from '@/src/components/maps/TrackMapEditor'
import { TrackMapEventLiveView } from '@/src/components/maps/TrackMapEventLiveView'
import { TrackMapView } from '@/src/components/maps/TrackMapView'
import { useTracks } from '@/src/state/useTracks'
import { useLocalSearchParams, router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function MapTrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const track = useTracks((s) => s.tracks.find((t) => t.id === id))

  const [isEditing, setIsEditing] = useState(false)

  const initialGridSize = useMemo(() => {
    if (!track) return 5
    return 5 + track.index * 2
  }, [track])

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
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          {isEditing ? (
            <Pressable onPress={() => setIsEditing(false)} style={styles.secondaryBtn} hitSlop={10}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setIsEditing(true)} style={styles.primaryBtn} hitSlop={10}>
              <Text style={styles.primaryBtnText}>Edit track</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>{track.name}</Text>
          <Text style={styles.pageSubtitle}>
            {isEditing ? 'Draw track / stands / grass' : 'Track layout preview'}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {isEditing ? (
          <TrackMapEditor
            trackId={track.id}
            sizePx={340}
            initialGridSize={initialGridSize}
            onSaved={() => setIsEditing(false)}
          />
        ) : (
          <TrackMapEventLiveView
            trackId={track.id}
            sizePx={300}
            initialGridSize={initialGridSize}
            capacity={track.capacity}
            maxCapacity={track.maxCapacity}
            entertainment={track.entertainment}
            maxEntertainment={track.maxEntertainment}
            trackSize={track.trackSize}
          />
        )}
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

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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

  primaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0B0F14',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },

  secondaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  secondaryBtnText: {
    color: 'rgba(0,0,0,0.78)',
    fontWeight: '900',
    fontSize: 13,
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
    fontSize: 13,
    color: 'rgba(0,0,0,0.55)',
    fontWeight: '700',
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
