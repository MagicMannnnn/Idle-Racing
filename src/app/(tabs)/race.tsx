import { DeterministicRaceView } from '@components/maps/DeterministicRaceView'
import type { CarAnim } from '@hooks/useTrackCars'
import { useTeam } from '@state/useTeam'
import { useTrackMaps } from '@state/useTrackMaps'
import { useTracks } from '@state/useTracks'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type RaceResultEntry = {
  position: number
  rating: number
  isTeam: boolean
  name: string
}

export default function RaceTab() {
  const activeRace = useTeam((s: any) => s.activeRace)
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const finishTeamRace = useTeam((s: any) => s.finishTeamRace)
  const allTracks = useTracks((s: any) => s.tracks)

  // Get track from activeRace
  const trackId = activeRace?.trackId
  const track = allTracks.find((t: any) => t.id === trackId)

  const setCarName = useTrackMaps((s: any) => s.setCarName)
  const carNames = useTrackMaps((s: any) => s.carNames || [])
  const carNumbers = useTrackMaps((s: any) => s.carNumbers || [])

  // Store latest race state for accurate results
  const latestCarsRef = useRef<CarAnim[]>([])
  const [raceResults, setRaceResults] = useState<RaceResultEntry[] | null>(null)

  // Callback to capture live race state
  const handleRaceStateUpdate = useCallback((cars: CarAnim[]) => {
    latestCarsRef.current = cars
  }, [])

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
    if (!activeRace || activeRace.finishedAt) return 0
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

  const handleEndRace = useCallback(() => {
    if (!activeRace || !track || activeRace.finishedAt) return

    // Get the actual car positions from the live race
    const cars = latestCarsRef.current

    if (cars.length === 0) {
      console.warn('No cars captured at race end')
      return
    }

    // Convert cars to sortable format (read SharedValue.value)
    const carsWithProgress = cars.map((car) => ({
      id: car.id,
      laps: Math.max(0, Math.floor(car.laps.value || 0)),
      progress: car.progress.value || 0,
      colorHex: car.colorHex,
    }))

    // Sort by progress (same as TrackLeaderboard)
    carsWithProgress.sort((a, b) => b.progress - a.progress)

    // Determine which car is the team's (first car ID 1)
    const teamCarId = 1
    const teamPosition = carsWithProgress.findIndex((car) => car.id === teamCarId) + 1

    // Get team driver name
    const teamDriverName = hiredDrivers.length > 0 ? hiredDrivers[0].name : 'Your Team'

    // Create results with names
    const usedNumbers = new Set<number>()
    const results: RaceResultEntry[] = carsWithProgress.map((car, idx) => {
      const carNumber = carNumbers[car.id - 1]
      let displayNumber: number
      if (carNumber !== undefined) {
        displayNumber = carNumber
      } else {
        displayNumber = car.id
        while (usedNumbers.has(displayNumber)) {
          displayNumber++
        }
      }
      usedNumbers.add(displayNumber)

      const isTeam = car.id === teamCarId
      const name = isTeam ? teamDriverName : `${carNames[car.id - 1] || 'Car'} #${displayNumber}`

      return {
        position: idx + 1,
        rating: 0, // Not needed for display
        isTeam,
        name,
      }
    })

    // Store results for display
    setRaceResults(results)

    // Finish race by adding result data to activeRace
    finishTeamRace(teamPosition, carsWithProgress.length, teamAverageRating)
  }, [activeRace, track, teamAverageRating, finishTeamRace, hiredDrivers, carNames, carNumbers])

  // Auto-finish race when timer is at 1 second or less (save results early)
  useEffect(() => {
    if (activeRace && !activeRace.finishedAt && timeRemaining <= 1) {
      handleEndRace()
    }
  }, [activeRace, timeRemaining, handleEndRace])

  // Clear results when starting a new race
  useEffect(() => {
    if (!activeRace || (activeRace && !activeRace.finishedAt)) {
      setRaceResults(null)
    }
  }, [activeRace?.seed]) // Clear when race seed changes (new race started)

  // Show results or empty state
  const isFinished = activeRace && activeRace.finishedAt !== undefined

  if (!activeRace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerWrap}>
          <View style={styles.headerTopRow}>
            <View style={styles.trackInfo}>
              <Text style={styles.pageTitle}>Race Results</Text>
              <Text style={styles.pageSubtitle}>Start a race from My Team</Text>
            </View>
          </View>
        </View>
        <View style={styles.content}>
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Final Results</Text>
            </View>
            <View style={styles.emptyResults}>
              <Text style={styles.emptyText}>No race results yet</Text>
              <Text style={styles.emptySubtext}>Complete a race to see results here</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (!track) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.notFound}>
          <Text style={styles.pageTitle}>Track not found</Text>
          <Text style={styles.pageSubtitle}>Start a race from My Team</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Only check for hired drivers if there's an active race that hasn't finished
  if (!isFinished && hiredDrivers.length === 0) {
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
              {isFinished
                ? `Final Results • ${activeRace.position} / ${activeRace.totalCars}`
                : `Racing as ${hiredDrivers[0].name} • ${hiredDrivers[0].rating}★`}
            </Text>
          </View>

          <View style={styles.rightSection}>
            {!isFinished && (
              <View style={timeRemaining > 0 ? styles.countdownPill : styles.finishedPill}>
                <Text style={timeRemaining > 0 ? styles.countdownText : styles.finishedText}>
                  {timeRemaining > 0 ? formatTimeRemaining(timeRemaining) : 'Finished'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {isFinished ? (
        <View style={styles.content}>
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>Final Leaderboard</Text>
              <Text style={styles.resultsSubtitle}>
                Position {activeRace.position} / {activeRace.totalCars}
              </Text>
            </View>
            <ScrollView
              style={styles.resultsScroll}
              contentContainerStyle={styles.resultsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {raceResults ? (
                raceResults.map((result) => (
                  <View
                    key={result.position}
                    style={[
                      styles.resultLeaderboardRow,
                      result.isTeam && styles.resultLeaderboardRowTeam,
                    ]}
                  >
                    <View
                      style={[
                        styles.resultLeaderboardPosition,
                        result.position === 1 && styles.resultLeaderboardPosition1st,
                        result.position === 2 && styles.resultLeaderboardPosition2nd,
                        result.position === 3 && styles.resultLeaderboardPosition3rd,
                        result.isTeam && styles.resultLeaderboardPositionTeam,
                      ]}
                    >
                      <Text
                        style={[
                          styles.resultLeaderboardPositionText,
                          result.isTeam && styles.resultLeaderboardPositionTextTeam,
                        ]}
                      >
                        {result.position}
                      </Text>
                    </View>
                    <View style={styles.resultLeaderboardInfo}>
                      <Text
                        style={[
                          styles.resultLeaderboardName,
                          result.isTeam && styles.resultLeaderboardNameTeam,
                        ]}
                      >
                        {result.name}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyResults}>
                  <Text style={styles.emptyText}>Loading results...</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      ) : (
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
            speedVariance={12}
            onRaceStateUpdate={handleRaceStateUpdate}
          />
        </View>
      )}
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

  resultsCard: {
    margin: 16,
    marginBottom: 0,
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B0F14',
    letterSpacing: -0.3,
  },
  resultsSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(0,0,0,0.55)',
    marginTop: 2,
  },
  resultsScroll: {
    flex: 1,
  },
  resultsScrollContent: {
    paddingVertical: 8,
  },
  resultLeaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  resultLeaderboardRowTeam: {
    backgroundColor: 'rgba(52,199,89,0.08)',
  },
  resultLeaderboardPosition: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultLeaderboardPosition1st: {
    backgroundColor: '#FFD700',
  },
  resultLeaderboardPosition2nd: {
    backgroundColor: '#C0C0C0',
  },
  resultLeaderboardPosition3rd: {
    backgroundColor: '#CD7F32',
  },
  resultLeaderboardPositionTeam: {
    backgroundColor: '#34C759',
  },
  resultLeaderboardPositionText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B0F14',
  },
  resultLeaderboardPositionTextTeam: {
    color: '#FFFFFF',
  },
  resultLeaderboardInfo: {
    flex: 1,
  },
  resultLeaderboardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B0F14',
  },
  resultLeaderboardNameTeam: {
    fontWeight: '900',
    color: '#34C759',
  },
  resultLeaderboardRating: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.45)',
    marginTop: 2,
  },
  emptyResults: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(0,0,0,0.35)',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.25)',
  },
})
