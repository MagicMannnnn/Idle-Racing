import { DeterministicRaceView } from '@components/maps/DeterministicRaceView'
import { useTeam } from '@state/useTeam'
import { useTrackMaps } from '@state/useTrackMaps'
import { useTracks } from '@state/useTracks'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function RaceTab() {
  const activeRace = useTeam((s: any) => s.activeRace)
  const drivers = useTeam((s: any) => s.drivers)
  const stopTeamRace = useTeam((s: any) => s.stopTeamRace)
  const track = useTracks((s: any) => s.tracks.find((t: any) => t.id === activeRace?.trackId))
  const setCarName = useTrackMaps((s: any) => s.setCarName)

  const [now, setNow] = useState(Date.now())

  const hiredDrivers = useMemo(
    () => drivers.filter((d: any) => d.hiringProgress === undefined),
    [drivers],
  )

  // Update current time every second for countdown
  useEffect(() => {
    const interval = setInterval(
      () => {
        setNow(Date.now())
      },
      activeRace ? 1000 : 5000,
    ) // slower updates when no race
    return () => clearInterval(interval)
  }, [activeRace])

  // Set the first car's name to the team driver's name (only once)
  useEffect(() => {
    if (hiredDrivers.length > 0 && activeRace) {
      const firstDriver = hiredDrivers[0]
      setCarName(0, firstDriver.name, 1)
    }
  }, [activeRace?.trackId]) // Only update when race track changes

  // Calculate time remaining
  const timeRemaining = useMemo(() => {
    if (!activeRace) return 0
    const endTime = activeRace.startedAt + activeRace.duration * 60 * 1000
    const remaining = Math.max(0, endTime - now)
    return Math.ceil(remaining / 1000) // seconds
  }, [activeRace, now])

  const formatTimeRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const initialGridSize = useMemo(() => {
    if (!track) return 5
    if (track.index > 50) return 30
    if (track.index > 14) {
      const minIndex = 14
      const maxIndex = 50
      const minSize = 20
      const maxSize = 30
      const t = (track.index - minIndex) / (maxIndex - minIndex)
      return Math.round(minSize + t * (maxSize - minSize))
    }
    return track.index < 2 ? 5 + track.index * 2 : 6 + track.index
  }, [track])

  const handleEndRace = () => {
    stopTeamRace()
    router.replace('/(tabs)/team')
  }

  if (!activeRace || !track) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.pageTitle}>No active race</Text>
          <Text style={styles.pageSubtitle}>Start a race from My Team</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (hiredDrivers.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.pageTitle}>No drivers hired</Text>
          <Text style={styles.pageSubtitle}>Hire a driver first to race</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <View style={styles.headerTopRow}>
          <View style={styles.trackInfo}>
            <Text style={styles.pageTitle}>{track.name}</Text>
            <Text style={styles.pageSubtitle}>
              Racing as {hiredDrivers[0].name} • {hiredDrivers[0].rating}★
            </Text>
          </View>

          <View style={styles.rightSection}>
            {timeRemaining > 0 ? (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>{formatTimeRemaining(timeRemaining)}</Text>
              </View>
            ) : (
              <View style={styles.finishedPill}>
                <Text style={styles.finishedText}>Finished</Text>
              </View>
            )}

            {timeRemaining === 0 && (
              <Pressable onPress={handleEndRace} style={styles.endBtn}>
                <Text style={styles.endBtnText}>End Race</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <DeterministicRaceView
          trackId={track.id}
          initialGridSize={initialGridSize}
          capacity={track.capacity}
          maxCapacity={track.maxCapacity}
          entertainment={track.entertainment}
          maxEntertainment={track.maxEntertainment}
          trackSize={track.trackSize}
          seed={activeRace.seed}
          startedAt={activeRace.startedAt}
          durationMs={activeRace.duration * 60 * 1000}
        />
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
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  trackInfo: {
    flex: 1,
    gap: 4,
  },

  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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

  countdownPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.3)',
  },
  countdownText: {
    color: '#34C759',
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  finishedPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(245,197,66,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,66,0.3)',
  },
  finishedText: {
    color: '#F5C542',
    fontSize: 13,
    fontWeight: '900',
  },

  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  endBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  content: {
    flex: 1,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
})
