import { router } from 'expo-router'
import React, { useMemo } from 'react'
import { FlatList, Pressable, StyleSheet, Text, View, Platform } from 'react-native'

type Track = { id: string; name: string; rating: number }

const TRACKS: Track[] = [
  { id: 'track', name: 'Track 1', rating: 1.0 },
  { id: 'track2', name: 'Track 2', rating: 1.5 },
]

function formatRating(r: number) {
  return r.toFixed(1)
}

function ratingLabel(r: number) {
  if (r >= 4.5) return 'Elite'
  if (r >= 3.5) return 'Great'
  if (r >= 2.5) return 'Good'
  if (r >= 1.5) return 'Rookie'
  return 'New'
}

export default function TracksIndex() {
  const avg = useMemo(() => {
    if (TRACKS.length === 0) return 0
    return TRACKS.reduce((a, t) => a + t.rating, 0) / TRACKS.length
  }, [])

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.title}>Tracks</Text>
        <Text style={styles.subtitle}>
          {TRACKS.length} track{TRACKS.length === 1 ? '' : 's'} • Avg ⭐ {formatRating(avg)}
        </Text>
      </View>

      <FlatList
        data={TRACKS}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/home/track/${item.id}`)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardInner}>
              <View style={styles.left}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {item.name}
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{ratingLabel(item.rating)}</Text>
                  </View>
                  <Text style={styles.metaText}>Tap to view details</Text>
                </View>
              </View>

              <View style={styles.right}>
                <View style={styles.ratingPill}>
                  <Text style={styles.ratingStar}>⭐</Text>
                  <Text style={styles.ratingText}>{formatRating(item.rating)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  // Light page background
  screen: {
    flex: 1,
    backgroundColor: '#F6F7FB',
  },

  top: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: '#0B0F14',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: 'rgba(11,15,20,0.65)',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Dark cards on light background
  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },

  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  left: {
    flex: 1,
    minWidth: 0,
  },
  trackName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.92)',
  },
  metaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
  },

  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  ratingStar: {
    fontSize: 14,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  chevron: {
    fontSize: 22,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.45)',
    marginRight: 2,
  },
})
