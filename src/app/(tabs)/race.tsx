import { HostedRaceTrackView } from '@components/team/HostedRaceTrackView'
import { Ionicons } from '@expo/vector-icons'
import type { HostedRaceResultRow } from '@state/useMyTeamRaces'
import { useMyTeamRaces } from '@state/useMyTeamRaces'
import { useTracks } from '@state/useTracks'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function HostedRaceView() {
  const getActiveRace = useMyTeamRaces((s: any) => s.getActiveRace)
  const awardPrestige = useMyTeamRaces((s: any) => s.awardPrestige)
  const getTracks = useTracks((s: any) => s.tracks)

  const race = getActiveRace()
  const [results, setResults] = useState<HostedRaceResultRow[] | null>(null)
  const [prestigeAwarded, setPrestigeAwarded] = useState(false)

  const track = useMemo(() => {
    if (!race) return null
    return getTracks.find((t: any) => t.id === race.config.trackId)
  }, [race, getTracks])

  // Load existing results
  useEffect(() => {
    if (race && race.state === 'finished' && race.results) {
      setResults(race.results)
      setPrestigeAwarded(race.prestigeAwarded)
    }
  }, [race])

  const handleAwardPrestige = () => {
    if (!race || race.state !== 'finished' || prestigeAwarded) return
    const result = awardPrestige()
    if (result.ok) {
      setPrestigeAwarded(true)
    }
  }

  const isFinished = race?.state === 'finished'

  if (!race || !track) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.title}>Race not found</Text>
        </View>
      </SafeAreaView>
    )
  }

  // Show live race view
  if (!isFinished) {
    return (
      <HostedRaceTrackView
        trackId={race.config.trackId}
        driverIds={race.config.driverIds}
        onFinished={setResults}
      />
    )
  }

  // Show results
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Race Complete</Text>
          <Text style={styles.headerSubtitle}>{track.name}</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.resultsContainer}>
        <View style={styles.resultsCard}>
          <View style={styles.resultsHeader}>
            <Ionicons name="trophy" size={28} color="#FFD700" />
            <Text style={styles.resultsTitle}>Final Results</Text>
          </View>

          <ScrollView
            style={styles.resultsList}
            contentContainerStyle={{ gap: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {results &&
              results.map((result) => (
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
                        <View style={styles.myTeamBadge}>
                          <Text style={styles.myTeamBadgeText}>MY TEAM</Text>
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
          </ScrollView>

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

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Text style={styles.backButtonText}>Back to My Team</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

export default function RaceTab() {
  const getActiveRace = useMyTeamRaces((s: any) => s.getActiveRace)
  const race = getActiveRace()

  // Only show race if it's actually running or finished (not idle)
  if (race && (race.state === 'running' || race.state === 'finished')) {
    return <HostedRaceView />
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Ionicons name="flag" size={64} color="rgba(255,255,255,0.3)" />
        <Text style={styles.title}>No Active Race</Text>
        <Text style={styles.description}>
          Go to My Team and tap "Host Race" to start a race with your drivers!
        </Text>
        <Pressable
          onPress={() => router.push('/team' as any)}
          style={({ pressed }) => [styles.goButton, pressed && styles.goButtonPressed]}
        >
          <Text style={styles.goButtonText}>Go to My Team</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0B0F14' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1f27',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  resultsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 24,
  },
  goButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  goButtonPressed: { opacity: 0.8 },
  goButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  resultsCard: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: '#1a1f27',
    borderRadius: 16,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultsList: { gap: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  resultRowFirst: {
    borderLeftColor: '#FFD700',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  resultRowSecond: {
    borderLeftColor: '#C0C0C0',
    backgroundColor: 'rgba(192, 192, 192, 0.1)',
  },
  resultRowThird: {
    borderLeftColor: '#CD7F32',
    backgroundColor: 'rgba(205, 127, 50, 0.1)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPosBoxFirst: { backgroundColor: '#FFD700' },
  resultPosBoxSecond: { backgroundColor: '#C0C0C0' },
  resultPosBoxThird: { backgroundColor: '#CD7F32' },
  resultPosText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resultPosTextTop: { color: '#0B0F14' },
  resultInfo: {
    flex: 1,
    gap: 4,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  myTeamBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  myTeamBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#fff',
  },
  prestigeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  prestigeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFD700',
  },
  awardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFB300',
    borderRadius: 12,
    padding: 14,
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
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  backButtonPressed: { opacity: 0.8 },
  backButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
})
