import { TrackMapView } from '@components/maps/TrackMapView'
import { Ionicons } from '@expo/vector-icons'
import { useMyTeamRaceCars } from '@hooks/useMyTeamRaceCars'
import type { HostedRaceResultRow } from '@state/useMyTeamRaces'
import { useMyTeamRaces } from '@state/useMyTeamRaces'
import { useTracks } from '@state/useTracks'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HostedRaceScreen() {
  const getActiveRace = useMyTeamRaces((s: any) => s.getActiveRace)
  const startRace = useMyTeamRaces((s: any) => s.startRace)
  const cancelRace = useMyTeamRaces((s: any) => s.cancelRace)
  const awardPrestige = useMyTeamRaces((s: any) => s.awardPrestige)
  const getTracks = useTracks((s: any) => s.tracks)

  const race = getActiveRace()
  const [results, setResults] = useState<HostedRaceResultRow[] | null>(null)
  const [prestigeAwarded, setPrestigeAwarded] = useState(false)
  const [raceStarted, setRaceStarted] = useState(false)

  // Get track info
  const track = useMemo(() => {
    if (!race) return null
    return getTracks.find((t: any) => t.id === race.config.trackId)
  }, [race, getTracks])

  // Initialize race cars hook
  const raceCars = useMyTeamRaceCars({
    raceId: race?.config.id || '',
    loop: race?.config.trackLoop || [],
    width: race?.config.trackWidth || 5,
    cellPx: 50,
    gapPx: 1,
    padPx: 1,
    onFinished: (res) => {
      setResults(res)
    },
  })

  // Auto-start race when component mounts
  useEffect(() => {
    if (race && race.state === 'idle' && !raceStarted) {
      const startResult = startRace()
      if (startResult.ok) {
        setRaceStarted(true)
        // Start animation after a brief delay
        setTimeout(() => {
          raceCars.start()
        }, 500)
      }
    }
  }, [race, startRace, raceCars, raceStarted])

  // Load existing results if race is finished
  useEffect(() => {
    if (race && race.state === 'finished' && race.results) {
      setResults(race.results)
      setPrestigeAwarded(race.prestigeAwarded)
    }
  }, [race])

  const handleCancel = () => {
    if (race && race.state !== 'finished') {
      cancelRace()
    }
    router.back()
  }

  const handleAwardPrestige = () => {
    if (!race || race.state !== 'finished' || prestigeAwarded) return

    const result = awardPrestige()
    if (result.ok) {
      setPrestigeAwarded(true)
    }
  }

  const handleBackToTeam = () => {
    router.back()
  }

  if (!race) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={28} color="#0B0F14" />
          </Pressable>
          <Text style={styles.headerTitle}>Hosted Race</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="rgba(11,15,20,0.3)" />
          <Text style={styles.errorText}>No active race</Text>
          <Pressable onPress={() => router.back()} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  const isRunning = race.state === 'running' && !raceCars.isFinished
  const isFinished = race.state === 'finished' || raceCars.isFinished

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={handleCancel} hitSlop={10}>
          <Ionicons name="arrow-back" size={28} color="#0B0F14" />
        </Pressable>
        <Text style={styles.headerTitle}>{isFinished ? 'Race Complete' : 'Racing...'}</Text>
        {!isFinished && (
          <Pressable onPress={handleCancel} hitSlop={10}>
            <Ionicons name="close-circle" size={28} color="#F44336" />
          </Pressable>
        )}
        {isFinished && <View style={{ width: 28 }} />}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Race Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Track:</Text>
            <Text style={styles.infoValue}>{track?.name || 'Unknown'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Competitor Rating:</Text>
            <Text style={styles.infoValue}>{race.config.competitorMean.toFixed(1)}★</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Field Size:</Text>
            <Text style={styles.infoValue}>{race.config.fieldSize} drivers</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>My Team Drivers:</Text>
            <Text style={styles.infoValue}>{race.config.driverIds.length}</Text>
          </View>
        </View>

        {/* Track Visualization */}
        {track && (
          <View style={styles.trackContainer}>
            <TrackMapView
              trackId={race.config.trackId}
              sizePx={300}
              initialGridSize={race.config.trackWidth}
              capacity={0}
              maxCapacity={0}
            />
          </View>
        )}

        {/* Live Leaderboard / Results */}
        {isRunning && (
          <View style={styles.leaderboardCard}>
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardTitle}>Live Positions</Text>
              <View style={styles.liveDot} />
            </View>
            {/* Simple live positions based on progress */}
            {raceCars.cars.length > 0 && (
              <View style={styles.leaderboardList}>
                {(() => {
                  // Sort cars by progress
                  const sorted = [...raceCars.cars]
                    .map((car, idx) => ({
                      car,
                      driver: raceCars.drivers[idx],
                      progress: car.progress.value || 0,
                    }))
                    .sort((a, b) => b.progress - a.progress)

                  return sorted.map((item, idx) => (
                    <View key={item.car.id} style={styles.leaderboardRow}>
                      <Text style={styles.leaderboardPos}>{idx + 1}</Text>
                      <View
                        style={[styles.leaderboardSwatch, { backgroundColor: item.car.colorHex }]}
                      />
                      <Text style={styles.leaderboardName}>
                        {item.driver?.driverName} #{item.driver?.driverNumber}
                      </Text>
                      {item.driver?.isMyTeam && (
                        <View style={styles.myTeamBadge}>
                          <Text style={styles.myTeamBadgeText}>MY TEAM</Text>
                        </View>
                      )}
                    </View>
                  ))
                })()}
              </View>
            )}
          </View>
        )}

        {/* Final Results */}
        {isFinished && results && (
          <View style={styles.resultsCard}>
            <View style={styles.resultsHeader}>
              <Ionicons name="trophy" size={28} color="#FFD700" />
              <Text style={styles.resultsTitle}>Final Results</Text>
            </View>

            <View style={styles.resultsList}>
              {results.map((result) => (
                <View
                  key={result.driverId}
                  style={[
                    styles.resultRow,
                    result.position === 1 && styles.resultRowFirst,
                    result.position === 2 && styles.resultRowSecond,
                    result.position === 3 && styles.resultRowThird,
                  ]}
                >
                  <View style={styles.resultLeft}>
                    <View
                      style={[
                        styles.resultPosBox,
                        result.position === 1 && styles.resultPosBoxFirst,
                        result.position === 2 && styles.resultPosBoxSecond,
                        result.position === 3 && styles.resultPosBoxThird,
                      ]}
                    >
                      <Text
                        style={[
                          styles.resultPosText,
                          (result.position === 1 ||
                            result.position === 2 ||
                            result.position === 3) &&
                            styles.resultPosTextTop,
                        ]}
                      >
                        {result.position}
                      </Text>
                    </View>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>
                        {result.driverName} #{result.driverNumber}
                      </Text>
                      {result.isMyTeam && (
                        <View style={styles.myTeamBadgeSmall}>
                          <Text style={styles.myTeamBadgeSmallText}>MY TEAM</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {result.prestigeAwarded !== undefined && result.prestigeAwarded > 0 && (
                    <View style={styles.prestigeBadge}>
                      <Ionicons name="star" size={14} color="#FFD700" />
                      <Text style={styles.prestigeText}>+{result.prestigeAwarded}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Award Prestige Button */}
            {!prestigeAwarded && (
              <Pressable
                onPress={handleAwardPrestige}
                style={({ pressed }) => [styles.awardButton, pressed && styles.awardButtonPressed]}
              >
                <Ionicons name="star" size={20} color="#fff" />
                <Text style={styles.awardButtonText}>Award Prestige Points</Text>
              </Pressable>
            )}

            {prestigeAwarded && (
              <View style={styles.awardedBox}>
                <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                <Text style={styles.awardedText}>Prestige points awarded!</Text>
              </View>
            )}

            {/* Back to Team Button */}
            <Pressable
              onPress={handleBackToTeam}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            >
              <Text style={styles.backButtonText}>Back to My Team</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(11,15,20,0.1)',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0B0F14',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 15,
    color: 'rgba(11,15,20,0.7)',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#0B0F14',
    fontWeight: '800',
  },
  trackContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  leaderboardCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  leaderboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leaderboardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0B0F14',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F44336',
  },
  leaderboardList: {
    gap: 8,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(11,15,20,0.03)',
    borderRadius: 8,
  },
  leaderboardPos: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0B0F14',
    width: 24,
  },
  leaderboardSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  leaderboardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0B0F14',
  },
  myTeamBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  myTeamBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  resultsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0B0F14',
  },
  resultsList: {
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(11,15,20,0.03)',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  resultRowFirst: {
    borderLeftColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
  },
  resultRowSecond: {
    borderLeftColor: '#C0C0C0',
    backgroundColor: 'rgba(192, 192, 192, 0.08)',
  },
  resultRowThird: {
    borderLeftColor: '#CD7F32',
    backgroundColor: 'rgba(205, 127, 50, 0.08)',
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  resultPosBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(11,15,20,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPosBoxFirst: { backgroundColor: '#FFD700' },
  resultPosBoxSecond: { backgroundColor: '#C0C0C0' },
  resultPosBoxThird: { backgroundColor: '#CD7F32' },
  resultPosText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0B0F14',
  },
  resultPosTextTop: {
    color: '#fff',
  },
  resultInfo: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B0F14',
  },
  myTeamBadgeSmall: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  myTeamBadgeSmallText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
  },
  prestigeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  prestigeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F57F17',
  },
  awardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFB300',
    borderRadius: 12,
    padding: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
    }),
  },
  awardButtonPressed: { opacity: 0.8 },
  awardButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  awardedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  awardedText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  backButton: {
    backgroundColor: '#2e2e2e',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  backButtonPressed: { opacity: 0.8 },
  backButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(11,15,20,0.5)',
  },
  errorButton: {
    backgroundColor: '#2e2e2e',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
})
