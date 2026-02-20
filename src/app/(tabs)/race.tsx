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
  const lastRaceResult = useTeam((s: any) => s.lastRaceResult)
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const stopTeamRace = useTeam((s: any) => s.stopTeamRace)
  const track = useTracks((s: any) => s.tracks.find((t: any) => t.id === activeRace?.trackId))
  const setCarName = useTrackMaps((s: any) => s.setCarName)

  const [now, setNow] = useState(Date.now())

  const hiredDrivers = useMemo(
    () => drivers.filter((d: any) => d.hiringProgress === undefined),
    [drivers],
  )

  // Calculate team average rating for race distribution
  const teamAverageRating = useMemo(() => {
    if (hiredDrivers.length === 0 || upgrades.length === 0) return 2.5 // default middle rating
    const driverRating = hiredDrivers[0].rating // use first driver's rating
    const carRating = upgrades.reduce((sum: number, u: any) => sum + u.value, 0) / upgrades.length
    return (driverRating + carRating) / 2
  }, [hiredDrivers, upgrades])

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
    if (!activeRace || !track) return

    // Calculate deterministic race position based on seed and team rating
    // Use a simple hash to get a position based on performance
    const performanceSeed = activeRace.seed ^ Math.floor(teamAverageRating * 1000)
    const positionRandom = (performanceSeed % 1000) / 1000

    // Better team rating = better position (with some randomness)
    // Rating 5.0 = likely top 10%, Rating 2.5 = middle pack, Rating 1.0 = bottom 25%
    const ratingFactor = teamAverageRating / 5.0 // 0.0 to 1.0
    const combinedScore = ratingFactor * 0.7 + positionRandom * 0.3

    const totalCars = Math.min(track.trackSize, 20)
    const position = Math.max(
      1,
      Math.min(totalCars, Math.floor((1 - combinedScore) * totalCars) + 1),
    )

    stopTeamRace({
      trackId: track.id,
      trackName: track.name,
      duration: activeRace.duration,
      finishedAt: Date.now(),
      position,
      totalCars,
    })

    router.replace('/(tabs)/team')
  }

  if (!activeRace || !track) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          {lastRaceResult ? (
            <>
              <Text style={styles.pageTitle}>Race Complete!</Text>
              <View style={styles.resultCard}>
                <Text style={styles.resultTrack}>{lastRaceResult.trackName}</Text>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Position:</Text>
                  <Text style={styles.resultValue}>
                    {lastRaceResult.position} / {lastRaceResult.totalCars}
                  </Text>
                </View>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Duration:</Text>
                  <Text style={styles.resultValue}>{lastRaceResult.duration} minutes</Text>
                </View>
              </View>
              <Text style={styles.pageSubtitle}>Start another race from My Team</Text>
            </>
          ) : (
            <>
              <Text style={styles.pageTitle}>No active race</Text>
              <Text style={styles.pageSubtitle}>Start a race from My Team</Text>
            </>
          )}
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
          teamAverageRating={teamAverageRating}
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
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginVertical: 24,
    gap: 16,
    minWidth: 300,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  resultTrack: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0B0F14',
    textAlign: 'center',
    marginBottom: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 15,
    color: 'rgba(0,0,0,0.55)',
    fontWeight: '600',
  },
  resultValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0B0F14',
  },
})
