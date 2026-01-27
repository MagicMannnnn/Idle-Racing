import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useEvents } from '@/src/state/useEvents'

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

function formatMoney(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

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

  // Only Track Day for now
  const active = useEvents((s) => s.getActive(track.id))
  const startTrackDay = useEvents((s) => s.startTrackDay)
  const startTicker = useEvents((s) => s.startTicker)
  const tickOnce = useEvents((s) => s.tickOnce)

  const [now, setNow] = useState(() => Date.now())
  const [stepIdx, setStepIdx] = useState(2) // default 10 min

  // ensure ticker is running while this screen is open
  useEffect(() => {
    startTicker()
  }, [startTicker])

  // local re-render ticker (UI only). money ticking is handled by store.
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      // keep store ticking even if caller forgot to startTicker (safe: tickOnce is cheap)
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

  const onRun = () => {
    const res = startTrackDay(track.id, runtimeMs)
    // ignore errors in UI for now (already running / track not found)
    void res
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.sectionTitle}>Events</Text>

      <View style={styles.card}>
        <View style={styles.eventTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitle}>Track Day</Text>
            <Text style={styles.eventSubtitle}>
              Open sessions • free to run • earns money while running
            </Text>
          </View>

          <View style={styles.eventStatusPill}>
            <Text style={styles.eventStatusText}>
              {!active
                ? 'Ready'
                : endsInMs > 0
                  ? `Running • ${formatCountdown(endsInMs)}`
                  : 'Finishing'}
            </Text>
          </View>
        </View>

        {/* runtime step selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepRow}
        >
          {STEPS_MIN.map((m, i) => {
            const activeStep = i === stepIdx
            const disabled = running // lock runtime choice while running
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

        {/* progress + earnings */}
        {active ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>

            <View style={styles.earnRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.bigIncome}>
                  + {formatMoney(Math.round(active.earntLastTick))}{' '}
                  {' /s  \ttotal: ' + active.total.toLocaleString()}
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
              style={({ pressed }) => [styles.runBtn, pressed && styles.pressed]}
            >
              <Text style={styles.runBtnText}>Run</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '900',
    color: '#0B0F14',
    letterSpacing: -0.2,
  },

  // Match your dark card styling
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
  buyLeftSub: { marginTop: 4, color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '800' },

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

  stopBtn: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtnText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 16 },
})
