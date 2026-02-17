import { addUnitId } from '@hooks/ads/constants'
import { useRewardedAd } from '@hooks/ads/useRewardedAd'
import { type EventType, getAvailableEvents, useEvents } from '@state/useEvents'
import { useSettings } from '@state/useSettings'
import formatMoney from '@utils/money'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

const rewardedAdUnitId = addUnitId
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
  rating: number
}

type EventConfig = {
  type: EventType
  label: string
  durations: readonly number[] // in minutes
  multiplier: number
}

const EVENT_CONFIGS: EventConfig[] = [
  {
    type: 'open_track_day',
    label: 'Open Track Day',
    durations: [0.5, 1, 5, 10, 15] as const,
    multiplier: 1,
  },
  {
    type: 'closed_testing',
    label: 'Closed Testing',
    durations: [60, 180, 360, 720] as const,
    multiplier: 1.2,
  },
  {
    type: 'club_race_day',
    label: 'Club Race Day',
    durations: [360, 720] as const,
    multiplier: 1.5,
  },
  {
    type: 'club_race_weekend',
    label: 'Club Race Weekend',
    durations: [1440, 2160, 2880] as const,
    multiplier: 1.8,
  },
  {
    type: 'national_race_day',
    label: 'National Race Day',
    durations: [360, 720] as const,
    multiplier: 2.5,
  },
  {
    type: 'national_race_weekend',
    label: 'National Race Weekend',
    durations: [1440, 2160, 2880] as const,
    multiplier: 3,
  },
  {
    type: 'endurance_race_weekend',
    label: 'Endurance Race Weekend',
    durations: [2880] as const,
    multiplier: 4,
  },
]

function formatDurationLabel(minutes: number) {
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  if (hours === 1) return `1 hour`
  return `${hours} hours`
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export default function TrackEvents(props: { track: TrackLike }) {
  const { track } = props

  const [now, setNow] = useState(() => Date.now())
  const [eventTypeIdx, setEventTypeIdx] = useState(0)
  const [durationIdx, setDurationIdx] = useState(0)

  // Filter events based on track rating
  const availableEventTypes = useMemo(() => getAvailableEvents(track.rating), [track.rating])
  const availableEvents = useMemo(
    () => EVENT_CONFIGS.filter((evt) => availableEventTypes.includes(evt.type)),
    [availableEventTypes],
  )
  const selectedEvent = availableEvents[eventTypeIdx] || availableEvents[0]
  const minutes = selectedEvent.durations[durationIdx]
  const runtimeMs = minutes * 60_000

  // ✅ Subscribe directly (fixes “need to navigate away/back”)
  const active = useEvents((s: any) => s.activeByTrack[track.id])

  const startTrackDay = useEvents((s: any) => s.startTrackDay)
  const startTicker = useEvents((s: any) => s.startTicker)
  const tickOnce = useEvents((s: any) => s.tickOnce)

  const locked = useEvents((s: any) => s.isTrackLocked(track.id, selectedEvent.type, now))
  const cooldownMs = useEvents((s: any) =>
    s.getCooldownRemainingMs(track.id, selectedEvent.type, now),
  )
  const inCooldown = cooldownMs > 0
  const enableAds = useSettings((s: any) => s.enableAds) && Platform.OS !== 'web'

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
    const res = startTrackDay(track.id, runtimeMs, selectedEvent.type, selectedEvent.multiplier)
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

        {enableAds && (
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
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.eventTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle}>
              {active
                ? EVENT_CONFIGS.find((evt) => evt.type === active.eventType)?.label ||
                  selectedEvent.label
                : selectedEvent.label}
              {(active ? active.earningsMultiplier : selectedEvent.multiplier) !== 1 && (
                <Text style={styles.multiplierText}>
                  {' '}
                  • x{active ? active.earningsMultiplier : selectedEvent.multiplier} earnings
                </Text>
              )}
            </Text>
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

        {/* Event Type Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepRow}
        >
          {availableEvents.map((evt, i) => {
            const activeType = i === eventTypeIdx
            const disabled = running
            return (
              <Pressable
                key={`event_type_${evt.type}`}
                onPress={() => {
                  setEventTypeIdx(i)
                  setDurationIdx(0) // Reset to first duration option
                }}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.eventTypeChip,
                  activeType && styles.eventTypeChipActive,
                  disabled && styles.stepChipDisabled,
                  pressed && !disabled && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.eventTypeChipText,
                    activeType && styles.eventTypeChipTextActive,
                    disabled && styles.stepChipTextDisabled,
                  ]}
                >
                  {evt.label}
                </Text>
                {evt.multiplier !== 1 && (
                  <Text
                    style={[
                      styles.eventTypeMultiplier,
                      activeType && styles.eventTypeMultiplierActive,
                    ]}
                  >
                    x{evt.multiplier}
                  </Text>
                )}
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Duration Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepRow}
        >
          {selectedEvent.durations.map((m, i) => {
            const activeStep = i === durationIdx
            const disabled = running
            return (
              <Pressable
                key={`duration_${m}`}
                onPress={() => setDurationIdx(i)}
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
  multiplierText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '700',
  },
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
    minWidth: 140,
    alignItems: 'center',
  },
  eventStatusText: { color: 'rgba(255,255,255,0.90)', fontWeight: '900', fontSize: 12 },

  stepRow: { gap: 8, marginTop: 12, paddingBottom: 2 },

  // Event type selector styles
  eventTypeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventTypeChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.20)',
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  eventTypeChipText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
    fontSize: 13,
  },
  eventTypeChipTextActive: {
    color: 'rgba(255,255,255,0.95)',
  },
  eventTypeMultiplier: {
    color: 'rgba(255,255,255,0.60)',
    fontWeight: '700',
    fontSize: 11,
  },
  eventTypeMultiplierActive: {
    color: 'rgba(59, 130, 246, 0.95)',
  },

  // Duration selector styles
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
