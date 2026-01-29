import { useMoney } from '@/src/state/useMoney'
import { useTracks, type UpgradeMode } from '@/src/state/useTracks'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Platform, ScrollView } from 'react-native'
import TrackEvents from '@/src/components/events/events'
import { SafeAreaView } from 'react-native-safe-area-context'

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export default function TrackDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const track = useTracks((s) => s.tracks.find((t) => t.id === id))
  const money = useMoney((s) => s.money)

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
  }, [track?.id, mode, quoteCapacityUpgrade, quoteSafetyUpgrade, quoteEntertainmentUpgrade, money])

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
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Text style={styles.backIcon}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.pageTitle}>{track.name}</Text>
          <Text style={styles.pageSubtitle}>
            {track.rating.toFixed(1)}★
            <Text style={styles.pageSubtitleMuted}>
              {' '}
              (precise {track.rating.toFixed(2)}★) {'\t\t'} Track Capacity: {track.trackSize} racers
            </Text>
          </Text>
        </View>

        <View style={styles.toggleRow}>
          <TogglePill label="x1" active={mode === 'x1'} onPress={() => setMode('x1')} />
          <TogglePill label="x10" active={mode === 'x10'} onPress={() => setMode('x10')} />
          <TogglePill label="MAX" active={mode === 'max'} onPress={() => setMode('max')} />
        </View>
      </View>

      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsContent}
        showsVerticalScrollIndicator={false}
      >
        <UpgradeCard
          title="Capacity"
          bigValue={`${track.capacity}`}
          bigUnit={` / ${track.maxCapacity}`}
          level={track.capacityLevel}
          quote={quotes?.capacity}
          onUpgrade={() => upgradeCapacityByMode(track.id, mode)}
        />

        <UpgradeCard
          title="Safety"
          bigValue={`${track.safety.toFixed(2)}`}
          bigUnit={` / ${track.maxSafety.toFixed(2)}`}
          level={track.safetyLevel}
          quote={quotes?.safety}
          onUpgrade={() => upgradeSafetyByMode(track.id, mode)}
        />

        <UpgradeCard
          title="Entertainment"
          bigValue={`${track.entertainment}%`}
          bigUnit={` / ${track.maxEntertainment}%`}
          level={track.entertainmentLevel}
          quote={quotes?.entertainment}
          onUpgrade={() => upgradeEntertainmentByMode(track.id, mode)}
        />

        <TrackEvents track={track} />
      </ScrollView>
    </SafeAreaView>
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
  bigValue: string
  bigUnit: string
  level: number
  quote: any
  onUpgrade: () => void
}) {
  const { title, bigValue, bigUnit, level, quote, onUpgrade } = props

  const maxed = !!quote && quote.ok === false
  const levels = quote?.ok ? quote.levels : 0
  const cost = quote?.ok ? quote.cost : 0

  const affordable = React.useMemo(() => {
    return !!quote?.ok && quote.affordable === true && levels > 0
  }, [quote, levels])
  const disabled = React.useMemo(() => {
    return !quote || maxed || !affordable
  }, [quote, maxed, affordable])

  const leftTitle = maxed ? 'Max' : `Buy ${levels}`
  const leftSub = maxed
    ? 'Fully upgraded'
    : quote?.ok && !quote.affordable
      ? 'Not enough money'
      : `Level ${level} → ${level + levels}`

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={styles.levelPill}>
          <Text style={styles.levelPillText}>Lv {level}</Text>
        </View>
      </View>

      <View style={styles.bigRow}>
        <Text style={styles.bigValue}>{bigValue}</Text>
        <Text style={styles.bigUnit}>{bigUnit}</Text>
      </View>

      <View style={styles.cardBottomRow}>
        <View style={styles.leftInfo}>
          <Text style={styles.buyLeft}>{leftTitle}</Text>
          <Text style={styles.buyLeftSub}>{leftSub}</Text>
        </View>

        <Pressable
          onPress={onUpgrade}
          disabled={disabled}
          style={({ pressed }) => [
            styles.buyBtnSmall,
            disabled && styles.buyBtnSmallDisabled,
            pressed && !disabled && styles.buyBtnSmallPressed,
          ]}
        >
          <Text style={[styles.buyBtnSmallText, disabled && styles.buyBtnSmallTextDisabled]}>
            {maxed ? 'MAX' : quote?.ok ? formatMoney(cost) : '...'}
          </Text>
          <Ionicons name="disc-outline" size={22} color="#F5C542" />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },

  notFound: { flex: 1, padding: 16, justifyContent: 'center' },

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  backIcon: { fontSize: 28, lineHeight: 28, fontWeight: '400', color: '#0B0F14' },
  backText: { fontSize: 16, fontWeight: '800', color: '#0B0F14' },

  header: { gap: 6 },
  pageTitle: { fontSize: 26, fontWeight: '900', color: '#0B0F14', letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 15, color: 'rgba(11,15,20,0.85)', fontWeight: '900' },
  pageSubtitleMuted: { color: 'rgba(11,15,20,0.55)', fontWeight: '800' },

  toggleRow: { flexDirection: 'row', gap: 10 },
  togglePill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.10)',
  },
  togglePillActive: { backgroundColor: '#0B0F14', borderColor: 'rgba(0,0,0,0.18)' },
  toggleText: { fontWeight: '900', fontSize: 14, color: 'rgba(11,15,20,0.75)' },
  toggleTextActive: { color: '#FFFFFF' },

  pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },

  cardsScroll: { flex: 1 },
  cardsContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
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
        shadowOpacity: 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 2 },
    }),
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },

  levelPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  levelPillText: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '900' },

  bigRow: { marginTop: 10, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bigValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  bigUnit: { color: 'rgba(255,255,255,0.60)', fontSize: 16, fontWeight: '800' },

  cardBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leftInfo: { flex: 1, minWidth: 0 },

  buyLeft: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  buyLeftSub: { marginTop: 4, color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '800' },

  buyBtnSmall: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 118,
  },
  buyBtnSmallPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  buyBtnSmallText: { color: '#0B0F14', fontWeight: '900', fontSize: 18 },

  buyBtnSmallDisabled: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  buyBtnSmallTextDisabled: { color: 'rgba(255,255,255,0.55)' },
})
