import { useOnboarding } from '@/src/state/useOnboarding'
import { useTracks } from '@/src/state/useTracks'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  Modal,
  TextInput,
} from 'react-native'

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

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function TracksIndex() {
  const tracks = useTracks((s) => s.tracks)
  const nextCost = useTracks((s) => s.nextTrackCost())
  const buyNextTrack = useTracks((s) => s.buyNextTrack)

  const completed = useOnboarding((s) => s.completed)
  const setStage = useOnboarding((s) => s.setStage)

  const [buyOpen, setBuyOpen] = useState(false)
  const [trackName, setTrackName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const avg = useMemo(() => {
    if (tracks.length === 0) return 0
    return tracks.reduce((a, t) => a + t.rating, 0) / tracks.length
  }, [tracks])

  const onOpenBuy = () => {
    setError(null)
    setTrackName('')
    setBuyOpen(true)
  }

  const onCancelBuy = () => {
    setBuyOpen(false)
    setError(null)
  }

  const onConfirmBuy = () => {
    const res = buyNextTrack(trackName || 'Castle Corner')
    if (!res.ok) {
      setError('Not enough money.')
      return
    }
    setBuyOpen(false)
    setError(null)

    if (!completed) setStage(1)
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Tracks</Text>
          <Text style={styles.subtitle}>
            {tracks.length} track{tracks.length === 1 ? '' : 's'} • Avg ⭐ {formatRating(avg)}
          </Text>
        </View>

        <Pressable
          onPress={onOpenBuy}
          style={({ pressed }) => [styles.buyBtn, pressed && styles.buyBtnPressed]}
        >
          <Text style={styles.buyBtnText}>Buy Track • {formatMoney(nextCost)}</Text>
          <Ionicons name="disc-outline" size={18} color="#F5C542" />
        </Pressable>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item: t }) => (
          <Pressable
            onPress={() => router.push(`/home/track/${t.id}`)}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <View style={styles.cardInner}>
              <View style={styles.left}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {t.name}
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{ratingLabel(t.rating)}</Text>
                  </View>
                  <Text style={styles.metaText}>Tap to view details</Text>
                </View>
              </View>

              <View style={styles.right}>
                <View style={styles.ratingPill}>
                  <Text style={styles.ratingStar}>⭐</Text>
                  <Text style={styles.ratingText}>{formatRating(t.rating)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No tracks yet</Text>
            <Text style={styles.emptyText}>Tap “Buy Track” to create your first track.</Text>
          </View>
        }
      />

      <Modal visible={buyOpen} transparent animationType="fade" onRequestClose={onCancelBuy}>
        <Pressable style={styles.modalBackdrop} onPress={onCancelBuy}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Buy Track</Text>

            <Text style={styles.modalLabel}>Track name</Text>
            <TextInput
              value={trackName}
              onChangeText={(v) => {
                setTrackName(v)
                setError(null)
              }}
              placeholder="e.g. Castle Corner"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="done"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={onCancelBuy}
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={onConfirmBuy}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrimary,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.btnPrimaryText}>Buy</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F6F7FB',
  },
  topRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
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

  buyBtn: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#0B0F14',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 2 },
    }),
  },
  buyBtnPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  buyBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

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
      android: { elevation: 2 },
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

  left: { flex: 1, minWidth: 0 },
  trackName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },

  metaRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  metaText: { fontSize: 13, color: 'rgba(255,255,255,0.60)' },

  right: { alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
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
  ratingStar: { fontSize: 14 },
  ratingText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  chevron: { fontSize: 22, lineHeight: 22, color: 'rgba(255,255,255,0.45)', marginRight: 2 },

  emptyWrap: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B0F14',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: 'rgba(11,15,20,0.65)',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: '#141414',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalLabel: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.80)',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    marginTop: 10,
    color: 'rgba(255,120,120,0.95)',
    fontWeight: '700',
  },
  modalButtons: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    minWidth: 90,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  btnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'transparent',
  },
  btnGhostText: { color: 'rgba(255,255,255,0.85)', fontWeight: '800' },

  btnPrimary: {
    backgroundColor: '#FFFFFF',
  },
  btnPrimaryText: { color: '#0B0F14', fontWeight: '900' },
})
