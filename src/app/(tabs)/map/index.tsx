import { Ionicons } from '@expo/vector-icons'
import { useMoney } from '@state/useMoney'
import { useTrackMaps } from '@state/useTrackMaps'
import { useTracks } from '@state/useTracks'
import formatMoney from '@utils/money'
import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
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

export default function MapIndex() {
  const tracks = useTracks((s: any) => s.tracks)

  const [buyOpen, setBuyOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [carName, setCarName] = useState('')
  const [carNumber, setCarNumber] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const carNames = useTrackMaps((s: any) => s.carNames)
  const carNumbers = useTrackMaps((s: any) => s.carNumbers)
  const setNewCarName = useTrackMaps((s: any) => s.setCarName)
  const canAfford = useMoney((s: any) => s.canAfford)
  const removeMoney = useMoney((s: any) => s.remove)
  const defaultCarNames: string[] = [
    'Bob',
    'Sally',
    'Max',
    'Caitlin',
    'Mark',
    'Jesse',
    'Alex',
    'Jordan',
    'Casey',
    'Riley',
    'Jamie',
    'Cameron',
    'Ellie',
    'Sam',
    'Charlie',
  ]

  const onOpenEdit = (index: number) => {
    setManageOpen(false)
    setError(null)
    setCarName(carNames?.[index] || '')
    setCarNumber(carNumbers?.[index]?.toString() || '')
    setEditingIndex(index)
    setBuyOpen(true)
  }

  const onCancelBuy = () => {
    setBuyOpen(false)
    setError(null)
  }

  const nextCost = useMemo(() => {
    const index = editingIndex !== null ? editingIndex : carNames?.length || 0
    return 100 + Math.pow(10, index) * 250
  }, [carNames, editingIndex])

  //console.log(Array.from({ length: 50 }, (_, i) => 100 + Math.pow(i, 3) * 250))

  const onConfirmBuy = () => {
    if (!canAfford(nextCost)) {
      setError('Not enough money.')
      return
    }
    setBuyOpen(false)
    setError(null)
    removeMoney(nextCost)

    const targetIndex = editingIndex !== null ? editingIndex : carNames?.length || 0
    const parsedNumber = carNumber.trim() ? parseInt(carNumber.trim(), 10) : undefined
    setNewCarName(
      targetIndex,
      carName.trim() || defaultCarNames[targetIndex % defaultCarNames.length],
      parsedNumber && !isNaN(parsedNumber) ? parsedNumber : undefined,
    )
    setEditingIndex(null)
  }

  const avg = useMemo(() => {
    if (tracks.length === 0) return 0
    return tracks.reduce((a: number, t: any) => a + t.rating, 0) / tracks.length
  }, [tracks])

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Tracks Map</Text>
          <Text style={styles.subtitle}>
            {tracks.length} track{tracks.length === 1 ? '' : 's'} • Avg ⭐ {formatRating(avg)}
          </Text>
        </View>
        <Pressable
          onPress={() => setManageOpen(true)}
          style={({ pressed }) => [styles.manageBtn, pressed && styles.manageBtnPressed]}
        >
          <Text style={styles.manageBtnText}>Manage Car Names</Text>
          <Ionicons name="create-outline" size={18} color="#F5C542" />
        </Pressable>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item: t }) => (
          <Pressable
            onPress={() => router.push(`/map/track/${t.id}`)}
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
                  <Text style={styles.metaText}>Tap to view and edit</Text>
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
      <Modal
        visible={manageOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManageOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.modalBackdropTouchable} onPress={() => setManageOpen(false)} />
          <View style={styles.manageModalCard}>
            <View style={styles.manageHeader}>
              <Text style={styles.modalTitle}>Manage Car Names</Text>
              <Pressable onPress={() => setManageOpen(false)}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.manageFlatList}
              contentContainerStyle={styles.manageScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {(() => {
                const usedNumbers = new Set<number>()
                const totalCars = tracks.length * 5 + 5

                return Array.from({ length: totalCars }, (_, idx) => idx).map((idx) => {
                  const name = carNames?.[idx]
                  const number = carNumbers?.[idx]

                  let displayNumber: number
                  if (number !== undefined) {
                    displayNumber = number
                  } else {
                    displayNumber = idx + 1
                    while (usedNumbers.has(displayNumber)) {
                      displayNumber++
                    }
                  }

                  usedNumbers.add(displayNumber)

                  const editCost = 100 + Math.pow(3, idx) * 250
                  return (
                    <View key={idx} style={styles.manageCarItem}>
                      <View style={styles.manageCarInfo}>
                        <Text style={styles.manageCarName}>
                          {name || `Car`} #{displayNumber}
                        </Text>
                        <Text style={styles.manageCarIndex}>Car {idx + 1}</Text>
                      </View>
                      <Pressable
                        onPress={() => onOpenEdit(idx)}
                        style={({ pressed }) => [
                          styles.manageEditBtn,
                          pressed && styles.manageEditBtnPressed,
                        ]}
                      >
                        <Text style={styles.manageEditText}>Edit • {formatMoney(editCost)}</Text>
                      </Pressable>
                    </View>
                  )
                })
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={buyOpen} transparent animationType="fade" onRequestClose={onCancelBuy}>
        <Pressable style={styles.modalBackdrop} onPress={onCancelBuy}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {editingIndex !== null ? `Edit Car ${editingIndex + 1}` : 'Buy Car Name'}
            </Text>

            <Text style={styles.modalLabel}>Car name</Text>
            <TextInput
              value={carName}
              onChangeText={(v) => {
                setCarName(v)
                setError(null)
              }}
              placeholder={`e.g. ${defaultCarNames[tracks.length % defaultCarNames.length]}`}
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.input}
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Car number (optional)</Text>
            <TextInput
              value={carNumber}
              onChangeText={(v) => {
                setCarNumber(v)
                setError(null)
              }}
              placeholder="e.g. 7"
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.input}
              keyboardType="number-pad"
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
                <Text style={styles.btnPrimaryText}>
                  {editingIndex !== null ? 'Update' : 'Buy'} • {formatMoney(nextCost)}
                </Text>
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

  manageBtn: {
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
  manageBtnPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.95,
  },
  manageBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },

  manageModalCard: {
    backgroundColor: '#141414',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    height: '80%',
    marginHorizontal: 18,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  manageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  manageFlatList: {
    flex: 1,
  },
  manageScrollContent: {
    padding: 12,
  },
  manageCarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 12,
    marginBottom: 8,
  },
  manageCarInfo: {
    flex: 1,
    minWidth: 0,
  },
  manageCarName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  manageCarIndex: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  manageEditBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  manageEditBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  manageEditText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0B0F14',
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
  modalBackdropTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
