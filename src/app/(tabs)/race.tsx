import { DeterministicRaceView } from '@components/maps/DeterministicRaceView'
import type { CarAnim } from '@hooks/useTrackCars'
import { usePrestige } from '@state/usePrestige'
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
  laps: number
  gap: number
  knowledgePoints: number
}

// Calculate knowledge points based on position and total cars
// Up to top 10 drivers, max 50% of field gets rewards
function calculateKnowledgePoints(position: number, totalCars: number): number {
  const rewardCount = Math.min(10, Math.floor(totalCars / 2))
  if (position > rewardCount) return 0

  // For small reward counts (≤5), use simple linear countdown
  if (rewardCount <= 5) {
    return rewardCount - position + 1
  }

  // For larger races, use scaled points with diminishing returns
  // Examples: 20 drivers (10 rewards) → 25, 20, 16, 13, 11, 8, 6, 4, 2, 1
  const positionRatio = (rewardCount - position + 1) / rewardCount
  const maxPoints = rewardCount * 2.5
  const points = Math.round(positionRatio * positionRatio * maxPoints)

  return Math.max(1, points)
}

export default function RaceTab() {
  const activeRace = useTeam((s: any) => s.activeRace)
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const finishTeamRace = useTeam((s: any) => s.finishTeamRace)
  const allTracks = useTracks((s: any) => s.tracks)
  const addKnowledge = usePrestige((s: any) => s.addKnowledge)

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

  // Set car names and numbers for all team drivers
  useEffect(() => {
    if (hiredDrivers.length > 0 && activeRace) {
      hiredDrivers.forEach((driver: any, idx: number) => {
        setCarName(idx, driver.name, driver.number)
      })
    }
  }, [activeRace?.trackId, hiredDrivers, setCarName])

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

    // Map driver numbers to team cars (car IDs 1, 2, 3, etc. match first, second, third driver)
    const teamCarIds = new Set(hiredDrivers.map((_: any, idx: number) => idx + 1))

    // Find best team position
    let bestTeamPosition = carsWithProgress.length + 1
    for (let idx = 0; idx < carsWithProgress.length; idx++) {
      if (teamCarIds.has(carsWithProgress[idx].id)) {
        bestTeamPosition = Math.min(bestTeamPosition, idx + 1)
      }
    }
    const teamPosition = bestTeamPosition <= carsWithProgress.length ? bestTeamPosition : 1

    // Create results with names, laps, and gaps
    const usedNumbers = new Set<number>()
    let prevProgress = 0
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

      // Check if this car ID corresponds to a team driver
      const isTeam = teamCarIds.has(car.id)
      const driverIndex = car.id - 1
      const teamDriver =
        isTeam && driverIndex < hiredDrivers.length ? hiredDrivers[driverIndex] : null
      const name = teamDriver
        ? `${teamDriver.name} #${teamDriver.number}`
        : `${carNames[car.id - 1] || 'Car'} #${displayNumber}`

      // Calculate gap (same logic as TrackLeaderboard)
      const gap = idx === 0 ? 0 : prevProgress - car.progress
      prevProgress = car.progress

      // Calculate knowledge points reward
      const knowledgePoints = calculateKnowledgePoints(idx + 1, carsWithProgress.length)

      return {
        position: idx + 1,
        rating: 0, // Not needed for display
        isTeam,
        name,
        laps: car.laps,
        gap,
        knowledgePoints,
      }
    })

    // Store results for display
    setRaceResults(results)

    // Award knowledge points to team driver if not already awarded
    if (!activeRace.knowledgeAwarded) {
      const teamResult = results.find((r) => r.isTeam)
      if (teamResult && teamResult.knowledgePoints > 0) {
        addKnowledge(teamResult.knowledgePoints)
      }
    }

    // Finish race by adding result data to activeRace
    finishTeamRace(teamPosition, carsWithProgress.length, teamAverageRating, true)
  }, [
    activeRace,
    track,
    teamAverageRating,
    finishTeamRace,
    hiredDrivers,
    carNames,
    carNumbers,
    addKnowledge,
  ])

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
              <Text style={styles.resultsTitle}>🏁 Final Results</Text>
              <Text style={styles.resultsSubtitle}>
                You finished P{activeRace.position} of {activeRace.totalCars}
              </Text>
            </View>

            {/* Column Headers */}
            <View style={styles.resultsTableHeader}>
              <Text style={[styles.resultsTableHeaderText, styles.colPos]}>P</Text>
              <Text style={[styles.resultsTableHeaderText, styles.colName]}>Driver</Text>
              <Text style={[styles.resultsTableHeaderText, styles.colKnowledge]}>KP</Text>
              <Text style={[styles.resultsTableHeaderText, styles.colLaps]}>Laps</Text>
              <Text style={[styles.resultsTableHeaderText, styles.colGap]}>Gap</Text>
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
                    <Text
                      style={[
                        styles.resultLeaderboardName,
                        result.isTeam && styles.resultLeaderboardNameTeam,
                      ]}
                    >
                      {result.name}
                    </Text>
                    <Text style={styles.resultLeaderboardKnowledge}>
                      {result.knowledgePoints > 0 ? `+${result.knowledgePoints}` : '—'}
                    </Text>
                    <Text style={styles.resultLeaderboardLaps}>{result.laps}</Text>
                    <Text style={styles.resultLeaderboardGap}>
                      {result.position === 1 ? '—' : `+${result.gap.toFixed(1)}`}
                    </Text>
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
    backgroundColor: '#F6F7FB',
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2e2e2e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
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
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
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
    backgroundColor: '#2e2e2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  resultsSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },
  resultsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  resultsTableHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colPos: {
    width: 44,
  },
  colName: {
    flex: 1,
  },
  colKnowledge: {
    width: 48,
    textAlign: 'right',
  },
  colLaps: {
    width: 48,
    textAlign: 'right',
  },
  colGap: {
    width: 62,
    textAlign: 'right',
  },
  resultsScroll: {
    flex: 1,
  },
  resultsScrollContent: {
    paddingBottom: 8,
  },
  resultLeaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  resultLeaderboardRowTeam: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.4)',
  },
  resultLeaderboardPosition: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
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
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  resultLeaderboardPositionText: {
    fontSize: 15,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
  },
  resultLeaderboardPositionTextTeam: {
    color: '#FFFFFF',
  },
  resultLeaderboardName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  resultLeaderboardNameTeam: {
    fontWeight: '900',
    color: 'rgba(255,255,255,0.95)',
  },
  resultLeaderboardKnowledge: {
    width: 48,
    fontSize: 14,
    fontWeight: '800',
    color: '#BB86FC',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  resultLeaderboardLaps: {
    width: 48,
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  resultLeaderboardGap: {
    width: 62,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyResults: {
    padding: 48,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.3)',
  },
})
