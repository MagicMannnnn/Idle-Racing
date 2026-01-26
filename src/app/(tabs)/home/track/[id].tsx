import { useTracks, type UpgradeMode } from '@/src/state/useTracks'
import { useLocalSearchParams, router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function TrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const track = useTracks((s) => s.tracks.find((t) => t.id === id))

  const quoteCapacityUpgrade = useTracks((s) => s.quoteCapacityUpgrade)
  const quoteSafetyUpgrade = useTracks((s) => s.quoteSafetyUpgrade)
  const quoteEntertainmentUpgrade = useTracks((s) => s.quoteEntertainmentUpgrade)

  const upgradeCapacityByMode = useTracks((s) => s.upgradeCapacityByMode)
  const upgradeSafetyByMode = useTracks((s) => s.upgradeSafetyByMode)
  const upgradeEntertainmentByMode = useTracks((s) => s.upgradeEntertainmentByMode)

  const [mode, setMode] = useState<UpgradeMode>('x1')

  const quotes = useMemo(() => {
    if (!track) return null
    return {
      capacity: quoteCapacityUpgrade(track.id, mode),
      safety: quoteSafetyUpgrade(track.id, mode),
      entertainment: quoteEntertainmentUpgrade(track.id, mode),
    }
  }, [track?.id, mode])

  if (!track) {
    return (
      <View style={styles.screen}>
        <Text style={styles.pageTitle}>Track not found</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
        <Text style={styles.backIcon}>‹</Text>
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.pageTitle}>{track.name}</Text>
        <Text style={styles.pageSubtitle}>
          Rating: {track.rating.toFixed(1)}★
          <Text style={styles.pageSubtitleMuted}> • precise {track.rating.toFixed(2)}★</Text>
        </Text>
      </View>

      {/* Upgrade mode toggle */}
      <View style={styles.toggleRow}>
        <TogglePill label="x1" active={mode === 'x1'} onPress={() => setMode('x1')} />
        <TogglePill label="x10" active={mode === 'x10'} onPress={() => setMode('x10')} />
        <TogglePill label="MAX" active={mode === 'max'} onPress={() => setMode('max')} />
      </View>

      <UpgradeCard
        title="Capacity"
        value={`${track.capacity} / ${track.maxCapacity}`}
        level={track.capacityLevel}
        quote={quotes?.capacity}
        onUpgrade={() => upgradeCapacityByMode(track.id, mode)}
      />

      <UpgradeCard
        title="Safety"
        value={`${track.safety.toFixed(2)} / ${track.maxSafety.toFixed(2)}`}
        level={track.safetyLevel}
        quote={quotes?.safety}
        onUpgrade={() => upgradeSafetyByMode(track.id, mode)}
      />

      <UpgradeCard
        title="Entertainment"
        value={`${track.entertainment}% / ${track.maxEntertainment}%`}
        level={track.entertainmentLevel}
        quote={quotes?.entertainment}
        onUpgrade={() => upgradeEntertainmentByMode(track.id, mode)}
      />
    </View>
  )
}

function TogglePill(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.togglePill,
        props.active && styles.togglePillActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.toggleText, props.active && styles.toggleTextActive]}>
        {props.label}
      </Text>
    </Pressable>
  )
}

function UpgradeCard(props: {
  title: string
  value: string
  level: number
  quote: any
  onUpgrade: () => void
}) {
  const { title, value, level, quote, onUpgrade } = props

  const disabled = !quote || quote.ok === false
  const levels = quote?.ok ? quote.levels : 0
  const cost = quote?.ok ? quote.cost : 0

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>

      <View style={styles.metaRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{value}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>Lv {level}</Text>
        </View>
      </View>

      <View style={styles.buyRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.buyText}>
            {disabled ? 'Max level reached' : `+${levels} level${levels === 1 ? '' : 's'}`}
          </Text>
          {!disabled ? <Text style={styles.buySubText}>Cost: {formatMoney(cost)}</Text> : null}
        </View>

        <Pressable
          onPress={onUpgrade}
          disabled={disabled}
          style={({ pressed }) => [
            styles.buyBtn,
            disabled && styles.buyBtnDisabled,
            pressed && !disabled && styles.buyBtnPressed,
          ]}
        >
          <Text style={[styles.buyBtnText, disabled && styles.buyBtnTextDisabled]}>Upgrade</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: '#F6F7FB' },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  backIcon: { fontSize: 28, lineHeight: 28, fontWeight: '400', color: '#0B0F14' },
  backText: { fontSize: 16, fontWeight: '700', color: '#0B0F14' },

  header: { marginTop: 2, gap: 6 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#0B0F14', letterSpacing: -0.3 },
  pageSubtitle: { fontSize: 13, color: 'rgba(11,15,20,0.75)', fontWeight: '700' },
  pageSubtitleMuted: { color: 'rgba(11,15,20,0.55)', fontWeight: '700' },

  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 2 },
  togglePill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  togglePillActive: { backgroundColor: '#0B0F14', borderColor: 'rgba(0,0,0,0.18)' },
  toggleText: { fontWeight: '900', color: 'rgba(11,15,20,0.75)' },
  toggleTextActive: { color: '#FFFFFF' },

  pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 2 },
    }),
  },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },

  metaRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pillText: { color: 'rgba(255,255,255,0.90)', fontSize: 12, fontWeight: '800' },

  buyRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  buyText: { color: 'rgba(255,255,255,0.92)', fontWeight: '900', fontSize: 13 },
  buySubText: { marginTop: 4, color: 'rgba(255,255,255,0.65)', fontWeight: '800', fontSize: 12 },

  buyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    minWidth: 100,
    alignItems: 'center',
  },
  buyBtnPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  buyBtnText: { color: '#0B0F14', fontWeight: '900' },

  buyBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  buyBtnTextDisabled: { color: 'rgba(255,255,255,0.55)' },
})
