import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEvents } from '@/src/state/useEvents'
import { formatMoney } from '@/src/components/money/MoneyHeader'
import { useRewardedAd } from '@/src/ads/useRewardedAd'
import { useSettings } from '@/src/state/useSettings'

const rewardedAdUnitId = 'ca-app-pub-1318873164119612/8719180699'
const MIN_REMAINING_MS_FOR_X2 = 15_000

type TrackLike = {
  id: string
  index: number
  capacity: number
  maxCapacity: number
  safety: number
  maxSafety: number
  entertainment: number
  maxEntertainment: number
}

const STEPS_MIN = [1, 5, 10, 30, 60, 180, 360, 720, 1440] as const

function formatDurationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  if (hours === 1) return `1 hour`
  return `${hours} hours`
}

function formatCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const remS = s % 60
  if (m <= 0) return `${remS}s`
  return `${m}m ${remS}s`
}

export default function TrackEvents(props: { track: TrackLike }) {
  const { track } = props

  const [now, setNow] = useState(() => Date.now())
  const [stepIdx, setStepIdx] = useState(0)

  // ✅ Subscribe directly (fixes “need to navigate away/back”)
  const active = useEvents((s) => s.activeByTrack[track.id])

  const startTrackDay = useEvents((s) => s.startTrackDay)
  const startTicker = useEvents((s) => s.startTicker)
  const tickOnce = useEvents((s) => s.tickOnce)

  const locked = useEvents((s) => s.isTrackLocked(track.id, now))
  const cooldownMs = useEvents((s) => s.getCooldownRemainingMs(track.id, now))
  const inCooldown = cooldownMs > 0
  const enableAds = useSettings((s) => s.enableAds)

  const { loaded, showing, show } = useRewardedAd({
    adUnitId: rewardedAdUnitId,
    useTestIds: __DEV__,
  })

  const earnedThisShowRef = useRef(false)

  useEffect(() => {
    startTicker()
  }, [startTicker])

  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      tickOnce(n)
    }, 1000)
    return () => clearInterval(t)
  }, [tickOnce])

  const minutes = STEPS_MIN[stepIdx]
  const runtimeMs = minutes * 60_000

  const running = !!active
  const endsInMs = active ? active.endsAt - now : 0

  const progress = useMemo(() => {
    if (!active) return 0
    const total = active.endsAt - active.startedAt
    if (total <= 0) return 0
    return Math.min(1, Math.max(0, (now - active.startedAt) / total))
  }, [active?.startedAt, active?.endsAt, now])

  const isBoosted = !!(active as any)?.incomeX2

  const onRun = () => {
    const res = startTrackDay(track.id, runtimeMs)
    void res
  }

  const onX2Press = async () => {
    const cur = useEvents.getState().activeByTrack[track.id]
    if (!cur) return
    if ((cur as any).incomeX2) return
    if (!loaded || showing) return

    const remaining = cur.endsAt - Date.now()
    if (remaining < MIN_REMAINING_MS_FOR_X2) return

    earnedThisShowRef.current = false

    await show(() => {
      earnedThisShowRef.current = true
      const res = useEvents.getState().setIncomeBoost(track.id, true)
      void res
    })
  }

  const displayEarnPerS = useMemo(() => {
    if (!active) return 0
    return Math.round((active as any).earntLastTick || 0)
  }, [active])

  const displayTotal = useMemo(() => {
    if (!active) return 0
    return Math.round((active as any).total || 0)
  }, [active])

  const tooLateForX2 = !!active && endsInMs > 0 && endsInMs < MIN_REMAINING_MS_FOR_X2
  const x2Disabled = !enableAds || !active || isBoosted || !loaded || showing || tooLateForX2

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Events</Text>

        <Pressable
          onPress={onX2Press}
          disabled={x2Disabled}
          hitSlop={10}
          style={({ pressed }) => [
            styles.x2Btn,
            x2Disabled && styles.x2BtnDisabled,
            pressed && !x2Disabled && styles.pressed,
          ]}
        >
          <Text style={[styles.x2BtnText, x2Disabled && styles.x2BtnTextDisabled]}>
            {isBoosted
              ? 'x2 active'
              : tooLateForX2
                ? 'x2 (too late)'
                : showing
                  ? 'playing…'
                  : loaded
                    ? 'x2 income'
                    : 'loading…'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.eventTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle}>Race Day</Text>
            <Text style={styles.eventSubtitle}>free to run • earns money while running</Text>
          </View>

          <View style={styles.eventStatusPill}>
            <Text style={styles.eventStatusText}>
              {!active
                ? inCooldown
                  ? `Cooldown • ${formatCountdown(cooldownMs)}`
                  : 'Ready'
                : endsInMs > 0
                  ? `Running • ${formatCountdown(endsInMs)}`
                  : 'Finishing'}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepRow}
        >
          {STEPS_MIN.map((m, i) => {
            const activeStep = i === stepIdx
            const disabled = running
            return (
              <Pressable
                key={`track_day_${m}`}
                onPress={() => setStepIdx(i)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.stepChip,
                  activeStep && styles.stepChipActive,
                  disabled && styles.stepChipDisabled,
                  pressed && !disabled && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.stepChipText,
                    activeStep && styles.stepChipTextActive,
                    disabled && styles.stepChipTextDisabled,
                  ]}
                >
                  {formatDurationLabel(m)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {active ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>

            <View style={styles.earnRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.bigIncome}>
                  + {formatMoney(displayEarnPerS)}{' '}
                  {'/s  \ttotal: ' + formatMoney(displayTotal).toLocaleString()}
                  {isBoosted ? '  (x2)' : ''}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.readyRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.buyLeft}>Run {formatDurationLabel(minutes)}</Text>
            </View>

            <Pressable
              onPress={onRun}
              disabled={locked}
              style={({ pressed }) => [
                styles.runBtn,
                locked && styles.runBtnDisabled,
                pressed && !locked && styles.pressed,
              ]}
            >
              <Text style={[styles.runBtnText, locked && styles.runBtnTextDisabled]}>
                {inCooldown ? formatCountdown(cooldownMs) : 'Run'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0B0F14',
    letterSpacing: -0.2,
    flexShrink: 0,
  },

  x2Btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgb(34, 34, 34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  x2BtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    opacity: 0.75,
  },
  x2BtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, letterSpacing: 0.2 },
  x2BtnTextDisabled: { color: 'rgba(255,255,255,0.70)' },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#2e2e2e',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },

  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  eventSubtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '800',
    fontSize: 12,
  },

  eventTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  eventStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  eventStatusText: { color: 'rgba(255,255,255,0.90)', fontWeight: '900', fontSize: 12 },

  stepRow: { gap: 8, marginTop: 12, paddingBottom: 2 },
  stepChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  stepChipActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  stepChipDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.10)',
  },
  stepChipText: { color: 'rgba(255,255,255,0.75)', fontWeight: '900', fontSize: 12 },
  stepChipTextActive: { color: '#FFFFFF' },
  stepChipTextDisabled: { color: 'rgba(255,255,255,0.45)' },

  readyRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },

  buyLeft: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },

  runBtn: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBtnText: { color: '#0B0F14', fontWeight: '900', fontSize: 16 },

  progressWrap: { marginTop: 14, gap: 12 },

  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },

  earnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  bigIncome: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },

  runBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  runBtnTextDisabled: {
    color: 'rgba(255,255,255,0.75)',
  },
})
