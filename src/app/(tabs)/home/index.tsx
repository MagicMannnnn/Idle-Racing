import { Ionicons } from '@expo/vector-icons'
import { useEvents } from '@state/useEvents'
import { useOnboarding } from '@state/useOnboarding'
import { usePrestige } from '@state/usePrestige'
import { useTracks } from '@state/useTracks'
import formatMoney from '@utils/money'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

function formatRating(r: number) {
  return r.toFixed(1)
}

function ratingLabel(r: number) {
  if (r >= 5.0) return 'World Class'
  if (r >= 4.5) return 'Elite'
  if (r >= 4.0) return 'Excellent'
  if (r >= 3.5) return 'Great'
  if (r >= 3.0) return 'Average'
  if (r >= 2.5) return 'Emerging'
  if (r >= 2.0) return 'Developing'
  if (r >= 1.5) return 'Rookie'
  return 'New'
}

export default function TracksIndex() {
  const tracks = useTracks((s: any) => s.tracks)
  const nextCost = useTracks((s: any) => s.nextTrackCost())
  const buyNextTrack = useTracks((s: any) => s.buyNextTrack)

  const calculateKnowledge = usePrestige((s: any) => s.calculateKnowledge)
  const prestige = usePrestige((s: any) => s.prestige)
  const totalKnowledge = usePrestige((s: any) => s.totalKnowledge)
  const earningsMultiplier = usePrestige((s: any) => s.calculateEarningsMultiplier())

  const completed = useOnboarding((s: any) => s.completed)
  const setStage = useOnboarding((s: any) => s.setStage)

  const [buyOpen, setBuyOpen] = useState(false)
  const [prestigeOpen, setPrestigeOpen] = useState(false)
  const [trackName, setTrackName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const startTicker = useEvents((s: any) => s.startTicker)
  const tickOnce = useEvents((s: any) => s.tickOnce)

  // Trigger event tick on mount to calculate offline progress
  useEffect(() => {
    startTicker()
    tickOnce(Date.now())
  }, [startTicker, tickOnce])

  const avg = useMemo(() => {
    if (tracks.length === 0) return 0
    return tracks.reduce((a: number, t: any) => a + t.rating, 0) / tracks.length
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

  const trackNames: string[] = [
    'Castle Corner',
    'Castle Hill',
    'Castle Curve',
    'Castle Loop',
    'Castle Valley',
    'Castle Ridge',
    'Castle Peak',
    'Castle Forest',
    'Castle River',
    'Castle Plains',
  ]

  const onConfirmBuy = () => {
    const res = buyNextTrack(trackName || trackNames[tracks.length % trackNames.length])
    if (!res.ok) {
      setError('Not enough money.')
      return
    }
    setBuyOpen(false)
    setError(null)

    if (!completed) setStage(1)
  }

  const onOpenPrestige = () => {
    setPrestigeOpen(true)
  }

  const onCancelPrestige = () => {
    setPrestigeOpen(false)
  }

  const onConfirmPrestige = () => {
    prestige()
    setPrestigeOpen(false)
  }

  const knowledgeToGain = useMemo(() => calculateKnowledge(), [calculateKnowledge, tracks])

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
        ListFooterComponent={
          <Pressable
            onPress={onOpenPrestige}
            style={({ pressed }) => [styles.prestigeBtn, pressed && styles.prestigeBtnPressed]}
          >
            <View style={styles.prestigeInner}>
              <View style={styles.prestigeLeft}>
                <Text style={styles.prestigeTitle}>Prestige</Text>
                <Text style={styles.prestigeSubtitle}>
                  Total Knowledge: {totalKnowledge} • Earnings: {earningsMultiplier}x
                </Text>
              </View>
              <View style={styles.prestigeRight}>
                <Text style={styles.prestigeKnowledge}>+{knowledgeToGain}</Text>
                <Ionicons name="trophy" size={20} color="#9B7EFF" />
              </View>
            </View>
          </Pressable>
        }
      />

      <Modal
        visible={prestigeOpen}
        transparent
        animationType="fade"
        onRequestClose={onCancelPrestige}
      >
        <Pressable style={styles.modalBackdrop} onPress={onCancelPrestige}>
          <Pressable style={styles.modalCardWhite} onPress={() => {}}>
            <Text style={styles.modalTitleDark}>Prestige</Text>

            <View style={styles.knowledgeBox}>
              <Text style={styles.knowledgeLabel}>Knowledge to be gained:</Text>
              <Text style={styles.knowledgeValue}>{knowledgeToGain}</Text>
            </View>

            <Text style={styles.prestigeWarning}>
              This will reset all progress (except track maps)
            </Text>
            <Text style={styles.prestigeInfo}>For every 100 knowledge, earnings will double.</Text>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={onCancelPrestige}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnGhostDark,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.btnGhostTextDark}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={onConfirmPrestige}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnPrestige,
                  pressed && styles.btnPressed,
                ]}
              >
                <Text style={styles.btnPrestigeText}>Prestige</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
              placeholder={`e.g. ${trackNames[tracks.length % trackNames.length]}`}
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

  prestigeBtn: {
    marginTop: 12,
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: 'rgba(155, 126, 255, 0.3)',
    ...Platform.select({
      ios: {
        shadowColor: '#9B7EFF',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 3 },
    }),
  },
  prestigeBtnPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  prestigeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prestigeLeft: {
    flex: 1,
  },
  prestigeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#9B7EFF',
  },
  prestigeSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
  },
  prestigeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(155, 126, 255, 0.15)',
  },
  prestigeKnowledge: {
    fontSize: 18,
    fontWeight: '900',
    color: '#9B7EFF',
  },

  modalCardWhite: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  modalTitleDark: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0B0F14',
  },
  knowledgeBox: {
    marginTop: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 14,
    backgroundColor: 'rgba(155, 126, 255, 0.08)',
    borderWidth: 2,
    borderColor: 'rgba(155, 126, 255, 0.2)',
    alignItems: 'center',
  },
  knowledgeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(11,15,20,0.60)',
    marginBottom: 8,
  },
  knowledgeValue: {
    fontSize: 48,
    fontWeight: '900',
    color: '#9B7EFF',
  },
  prestigeWarning: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,80,80,0.85)',
    textAlign: 'center',
    marginBottom: 8,
  },
  prestigeInfo: {
    fontSize: 13,
    color: 'rgba(11,15,20,0.65)',
    textAlign: 'center',
    marginBottom: 16,
  },

  btnGhostDark: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.16)',
    backgroundColor: 'transparent',
  },
  btnGhostTextDark: {
    color: 'rgba(11,15,20,0.75)',
    fontWeight: '800',
  },

  btnPrestige: {
    backgroundColor: '#9B7EFF',
  },
  btnPrestigeText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
})
