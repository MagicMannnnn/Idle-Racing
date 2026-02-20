import { Ionicons } from '@expo/vector-icons'
import { useEvents } from '@state/useEvents'
import { useTeam } from '@state/useTeam'
import { useTrackMaps } from '@state/useTrackMaps'
import { useTracks } from '@state/useTracks'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

function TeamCard({
  icon,
  title,
  bigValue,
  bigUnit,
  subtitle,
  onPress,
  upgrading,
}: {
  icon: string
  title: string
  bigValue: string
  bigUnit: string
  subtitle: string
  onPress: () => void
  upgrading?: boolean
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={icon as any} size={20} color="#FFFFFF" />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {upgrading && (
          <View style={styles.statusPill}>
            <Text style={styles.statusPillText}>Upgrading</Text>
          </View>
        )}
      </View>

      <View style={styles.bigRow}>
        <Text style={styles.bigValue}>{bigValue}</Text>
        <Text style={styles.bigUnit}>{bigUnit}</Text>
      </View>

      <View style={styles.cardBottomRow}>
        <View style={styles.leftInfo}>
          <Text style={styles.subtitleText}>{subtitle}</Text>
        </View>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.viewBtn, pressed && styles.viewBtnPressed]}
        >
          <Text style={styles.viewBtnText}>View</Text>
          <Ionicons name="chevron-forward" size={18} color="#0B0F14" />
        </Pressable>
      </View>
    </View>
  )
}

export default function TeamIndex() {
  const hq = useTeam((s: any) => s.hq)
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const tick = useTeam((s: any) => s.tick)
  const activeRace = useTeam((s: any) => s.activeRace)
  const startTeamRace = useTeam((s: any) => s.startTeamRace)
  const tracks = useTracks((s: any) => s.tracks)
  const getActive = useEvents((s: any) => s.getActive)
  const startTrackDay = useEvents((s: any) => s.startTrackDay)
  const setCarName = useTrackMaps((s: any) => s.setCarName)

  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [hostModalOpen, setHostModalOpen] = useState(false)
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [raceWithAI, setRaceWithAI] = useState(true)
  const [raceDuration, setRaceDuration] = useState(1) // 1, 2, or 5 minutes
  const [now, setNow] = useState(Date.now())

  // Update current time every second for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Tick every 100ms to update progress bars
  useEffect(() => {
    const interval = setInterval(() => {
      tick(Date.now())
    }, 100)
    return () => clearInterval(interval)
  }, [tick])

  const hiredDrivers = drivers.filter((d: any) => d.hiringProgress === undefined)
  const hiringDrivers = drivers.filter((d: any) => d.hiringProgress !== undefined)

  const hasDrivers = hiredDrivers.length > 0

  const avgDriverRating =
    hiredDrivers.length > 0
      ? hiredDrivers.reduce((sum: number, d: any) => sum + d.rating, 0) / hiredDrivers.length
      : 0

  const carRating = upgrades.reduce((sum: number, u: any) => sum + u.value, 0) / upgrades.length

  const activeUpgrades = upgrades.filter((u: any) => u.upgrading).length

  // Filter tracks to only show those without active events
  const availableTracks = useMemo(() => {
    return tracks.filter((track: any) => !getActive(track.id))
  }, [tracks, getActive])

  const handleHostRace = () => {
    if (!selectedTrackId || !raceWithAI) return

    // Start team race in state
    const result = startTeamRace(selectedTrackId, raceDuration)
    if (!result.ok) {
      alert('Cannot start race')
      return
    }

    // Set driver name for the race
    if (hiredDrivers.length > 0) {
      setCarName(0, hiredDrivers[0].name, 1)
    }

    // Create event for the track (using 'open_track_day' type, multiplier 1)
    const runtimeMs = raceDuration * 60 * 1000
    startTrackDay(selectedTrackId, runtimeMs, 'open_track_day', 1)

    router.push('/(tabs)/race' as any)
    setHostModalOpen(false)
  }

  const handleResumeRace = () => {
    if (activeRace) {
      router.push('/(tabs)/race' as any)
    }
  }

  // Calculate time remaining for active race
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

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.headerWrap}>
        <Text style={styles.pageTitle}>My Team</Text>
        <Text style={styles.pageSubtitle}>Headquarters • Drivers • Upgrades</Text>
      </View>

      <ScrollView
        style={styles.cardsScroll}
        contentContainerStyle={styles.cardsContent}
        showsVerticalScrollIndicator={false}
      >
        <TeamCard
          icon="business"
          title="Headquarters"
          bigValue={`Level ${hq.level}`}
          bigUnit=""
          subtitle={`Unlocks ${hq.maxDriverRating}★ drivers • Reduces build time`}
          onPress={() => router.push('/team/hq' as any)}
          upgrading={hq.upgrading}
        />

        <TeamCard
          icon="people"
          title="Drivers"
          bigValue={`${hiredDrivers.length}`}
          bigUnit={` / ${hq.maxDriverRating}`}
          subtitle={
            hiringDrivers.length > 0
              ? `${hiringDrivers.length} driver${hiringDrivers.length > 1 ? 's' : ''} hiring...`
              : avgDriverRating > 0
                ? `Average rating: ${avgDriverRating.toFixed(1)}★`
                : 'No drivers hired yet'
          }
          onPress={() => router.push('/team/drivers' as any)}
          upgrading={hiringDrivers.length > 0}
        />

        <TeamCard
          icon="car-sport"
          title="Car Upgrades"
          bigValue={carRating.toFixed(1)}
          bigUnit=""
          subtitle={
            activeUpgrades > 0
              ? `${activeUpgrades} component${activeUpgrades > 1 ? 's' : ''} upgrading...`
              : `${upgrades.length} components ready for racing`
          }
          onPress={() => router.push('/team/upgrades' as any)}
          upgrading={activeUpgrades > 0}
        />

        {/* Racing Buttons */}
        <View style={styles.racingSection}>
          <Text style={styles.racingSectionTitle}>Racing</Text>
          {activeRace && timeRemaining > 0 ? (
            <>
              <Pressable
                onPress={handleResumeRace}
                style={({ pressed }) => [styles.resumeRaceBtn, pressed && styles.raceBtnPressed]}
              >
                <Ionicons name="play-circle" size={24} color="#FFFFFF" />
                <View style={styles.resumeRaceContent}>
                  <Text style={styles.resumeRaceBtnText}>Resume Race</Text>
                  <Text style={styles.resumeRaceTime}>{formatTimeRemaining(timeRemaining)}</Text>
                </View>
              </Pressable>
              <Text style={styles.racingHint}>
                Racing on {tracks.find((t: any) => t.id === activeRace.trackId)?.name || 'track'}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.racingButtons}>
                <Pressable
                  onPress={() => setHostModalOpen(true)}
                  disabled={!hasDrivers}
                  style={({ pressed }) => [
                    styles.raceBtn,
                    styles.hostRaceBtn,
                    !hasDrivers && styles.raceBtnDisabled,
                    pressed && hasDrivers && styles.raceBtnPressed,
                  ]}
                >
                  <Ionicons
                    name="flag"
                    size={20}
                    color={hasDrivers ? '#FFFFFF' : 'rgba(255,255,255,0.40)'}
                  />
                  <Text style={[styles.raceBtnText, !hasDrivers && styles.raceBtnTextDisabled]}>
                    Host Race
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setJoinModalOpen(true)}
                  disabled={!hasDrivers}
                  style={({ pressed }) => [
                    styles.raceBtn,
                    styles.joinRaceBtn,
                    !hasDrivers && styles.raceBtnDisabled,
                    pressed && hasDrivers && styles.raceBtnPressed,
                  ]}
                >
                  <Ionicons
                    name="enter"
                    size={20}
                    color={hasDrivers ? '#FFFFFF' : 'rgba(255,255,255,0.40)'}
                  />
                  <Text style={[styles.raceBtnText, !hasDrivers && styles.raceBtnTextDisabled]}>
                    Join Race
                  </Text>
                </Pressable>
              </View>
              {!hasDrivers && <Text style={styles.racingHint}>Hire a driver to start racing</Text>}
            </>
          )}
        </View>
      </ScrollView>

      {/* Join Race Modal */}
      <Modal
        visible={joinModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setJoinModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Join Race</Text>
            <View style={styles.comingSoonContent}>
              <Ionicons name="construct" size={48} color="rgba(255,255,255,0.60)" />
              <Text style={styles.comingSoonText}>Feature coming soon!</Text>
              <Text style={styles.comingSoonSubtext}>
                Multiplayer racing will be available in a future update.
              </Text>
            </View>
            <Pressable
              onPress={() => setJoinModalOpen(false)}
              style={({ pressed }) => [styles.modalBtn, pressed && styles.modalBtnPressed]}
            >
              <Text style={styles.modalBtnText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Host Race Modal */}
      <Modal
        visible={hostModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setHostModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setHostModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Host Race</Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Select Track</Text>
              <ScrollView style={styles.trackList} showsVerticalScrollIndicator={false}>
                {availableTracks.length === 0 ? (
                  <Text style={styles.noTracksText}>
                    No tracks available. Wait for events to finish.
                  </Text>
                ) : (
                  availableTracks.map((track: any) => (
                    <Pressable
                      key={track.id}
                      onPress={() => setSelectedTrackId(track.id)}
                      style={({ pressed }) => [
                        styles.trackItem,
                        selectedTrackId === track.id && styles.trackItemSelected,
                        pressed && styles.trackItemPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.trackItemText,
                          selectedTrackId === track.id && styles.trackItemTextSelected,
                        ]}
                      >
                        {track.name}
                      </Text>
                      {selectedTrackId === track.id && (
                        <Ionicons name="checkmark-circle" size={20} color="#F5C542" />
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>

            <View style={styles.modalSection}>
              <Pressable onPress={() => setRaceWithAI(!raceWithAI)} style={styles.checkboxRow}>
                <View style={[styles.checkbox, raceWithAI && styles.checkboxChecked]}>
                  {raceWithAI && <Ionicons name="checkmark" size={16} color="#0B0F14" />}
                </View>
                <Text style={styles.checkboxLabel}>Race against AI</Text>
              </Pressable>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Race Duration</Text>
              <View style={styles.durationButtons}>
                {[1, 2, 5].map((duration) => (
                  <Pressable
                    key={duration}
                    onPress={() => setRaceDuration(duration)}
                    style={({ pressed }) => [
                      styles.durationBtn,
                      raceDuration === duration && styles.durationBtnSelected,
                      pressed && styles.durationBtnPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.durationBtnText,
                        raceDuration === duration && styles.durationBtnTextSelected,
                      ]}
                    >
                      {duration} min
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setHostModalOpen(false)}
                style={({ pressed }) => [
                  styles.modalBtnSecondary,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleHostRace}
                disabled={!selectedTrackId || !raceWithAI}
                style={({ pressed }) => [
                  styles.modalBtn,
                  (!selectedTrackId || !raceWithAI) && styles.modalBtnDisabled,
                  pressed && selectedTrackId && raceWithAI && styles.modalBtnPressed,
                ]}
              >
                <Text
                  style={[
                    styles.modalBtnText,
                    (!selectedTrackId || !raceWithAI) && styles.modalBtnTextDisabled,
                  ]}
                >
                  Start Race
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7FB' },

  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },

  pageTitle: { fontSize: 26, fontWeight: '900', color: '#0B0F14', letterSpacing: -0.4 },
  pageSubtitle: { fontSize: 15, color: 'rgba(11,15,20,0.65)', fontWeight: '800' },

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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,149,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.3)',
  },
  statusPillText: { color: '#FF9500', fontSize: 12, fontWeight: '900' },

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

  subtitleText: { color: 'rgba(255,255,255,0.70)', fontSize: 14, fontWeight: '800' },

  viewBtn: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 90,
  },
  viewBtnPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  viewBtnText: { color: '#0B0F14', fontWeight: '900', fontSize: 16 },

  // Racing Section
  racingSection: {
    marginTop: 24,
    gap: 12,
  },
  racingSectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0B0F14',
    letterSpacing: -0.3,
  },
  racingButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  raceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: '#F5C542',
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
  hostRaceBtn: {
    backgroundColor: '#F5C542',
  },
  joinRaceBtn: {
    backgroundColor: '#4A90E2',
  },
  raceBtnDisabled: {
    backgroundColor: 'rgba(11,15,20,0.15)',
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  raceBtnPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  raceBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  raceBtnTextDisabled: {
    color: 'rgba(255,255,255,0.40)',
  },
  racingHint: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(11,15,20,0.50)',
    textAlign: 'center',
    marginTop: 4,
  },
  resumeRaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: '#34C759',
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
  resumeRaceBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  resumeRaceContent: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  resumeRaceTime: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#2e2e2e',
    borderRadius: 20,
    padding: 20,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 8 },
    }),
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.70)',
  },

  // Coming Soon Content
  comingSoonContent: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  comingSoonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  comingSoonSubtext: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
  },

  // Track List
  trackList: {
    maxHeight: 200,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
  },
  trackItemSelected: {
    backgroundColor: 'rgba(245,197,66,0.15)',
    borderWidth: 2,
    borderColor: '#F5C542',
  },
  trackItemPressed: {
    opacity: 0.7,
  },
  trackItemText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.80)',
  },
  trackItemTextSelected: {
    color: '#F5C542',
    fontWeight: '900',
  },
  noTracksText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#F5C542',
    borderColor: '#F5C542',
  },
  checkboxLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Duration Buttons
  durationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  durationBtnSelected: {
    backgroundColor: 'rgba(245,197,66,0.15)',
    borderColor: '#F5C542',
  },
  durationBtnPressed: {
    opacity: 0.7,
  },
  durationBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.70)',
  },
  durationBtnTextSelected: {
    color: '#F5C542',
    fontWeight: '900',
  },

  // Modal Buttons
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5C542',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnDisabled: {
    backgroundColor: 'rgba(245,197,66,0.30)',
  },
  modalBtnPressed: {
    opacity: 0.8,
  },
  modalBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  modalBtnTextDisabled: {
    color: 'rgba(255,255,255,0.40)',
  },
  modalBtnSecondaryText: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.70)',
  },
})
