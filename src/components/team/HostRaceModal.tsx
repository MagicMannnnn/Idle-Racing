import { Ionicons } from '@expo/vector-icons'
import { useMyTeamRaces } from '@state/useMyTeamRaces'
import { useTeam } from '@state/useTeam'
import { useTrackMaps } from '@state/useTrackMaps'
import { useTracks } from '@state/useTracks'
import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import {
  Clipboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

type Props = {
  visible: boolean
  onClose: () => void
}

export function HostRaceModal({ visible, onClose }: Props) {
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const tracks = useTracks((s: any) => s.tracks)
  const getTrackGrid = useTrackMaps((s: any) => s.get)
  const createRace = useMyTeamRaces((s: any) => s.createRace)
  const startRace = useMyTeamRaces((s: any) => s.startRace)
  const getCompetitorMean = useMyTeamRaces((s: any) => s.getCompetitorMean)

  // Filter eligible drivers (hired + valid contract)
  const eligibleDrivers = useMemo(() => {
    const now = Date.now()
    return drivers.filter((d: any) => {
      // Must be fully hired
      if (d.hiringProgress !== undefined) return false
      // Contract must not be expired
      if (d.contractExpiresAt && d.contractExpiresAt < now) return false
      return true
    })
  }, [drivers])

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [fieldSize, setFieldSize] = useState(Math.max(10, eligibleDrivers.length))
  const [laps, setLaps] = useState(3)
  const [error, setError] = useState('')

  // Generate random seed once
  const raceSeed = useMemo(
    () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    [visible],
  )

  // Auto-select all eligible drivers
  const selectedDriverIds = useMemo(
    () => new Set(eligibleDrivers.map((d: any) => d.id)),
    [eligibleDrivers],
  )

  // Copy seed to clipboard
  const handleCopySeed = () => {
    Clipboard.setString(raceSeed)
  }

  // Update field size when eligible drivers change
  React.useEffect(() => {
    setFieldSize(Math.max(10, eligibleDrivers.length, fieldSize))
  }, [eligibleDrivers.length])

  // Calculate car rating
  const carRating = useMemo(() => {
    return upgrades.reduce((sum: number, u: any) => sum + u.value, 0) / upgrades.length
  }, [upgrades])

  // Calculate average My Team rating
  const myTeamRating = useMemo(() => {
    if (eligibleDrivers.length === 0) return 0
    const totalEffective = eligibleDrivers.reduce((sum: number, d: any) => {
      return sum + (d.rating + carRating) / 2
    }, 0)
    return totalEffective / eligibleDrivers.length
  }, [eligibleDrivers, carRating])

  // Get competitor mean
  const competitorMean = getCompetitorMean()

  // Reset form
  const resetForm = () => {
    setSelectedTrackId(null)
    setFieldSize(Math.max(10, eligibleDrivers.length))
    setLaps(3)
    setError('')
  }

  const handleStartRace = () => {
    setError('')

    // Validation
    if (!selectedTrackId) {
      setError('Please select a track')
      return
    }

    if (eligibleDrivers.length === 0) {
      setError('No eligible drivers available')
      return
    }

    if (fieldSize < selectedDriverIds.size) {
      setError(`Field size must be at least ${selectedDriverIds.size}`)
      return
    }

    if (fieldSize > 20) {
      setError('Maximum field size is 20')
      return
    }

    // Get track data
    const track = tracks.find((t: any) => t.id === selectedTrackId)
    if (!track) {
      setError('Invalid track selected')
      return
    }

    const grid = getTrackGrid(selectedTrackId)
    if (!grid || !grid.cells) {
      setError('Track layout not available')
      return
    }

    // Extract track loop (find track cells)
    const trackLoop: number[] = []
    for (let i = 0; i < grid.cells.length; i++) {
      if (grid.cells[i] === 'track') {
        trackLoop.push(i)
      }
    }

    if (trackLoop.length === 0) {
      setError('Track has no racing line defined')
      return
    }

    // Create race
    const result = createRace({
      seed: raceSeed,
      trackId: selectedTrackId,
      trackLoop,
      trackWidth: grid.size,
      driverIds: Array.from(selectedDriverIds),
      competitorMean,
      fieldSize,
      laps,
    })

    if (!result.ok) {
      setError(`Failed to create race: ${result.reason}`)
      return
    }

    // Start race immediately
    const startResult = startRace()
    if (!startResult.ok) {
      setError(`Failed to start race: ${startResult.reason}`)
      return
    }

    // Navigate to race tab
    resetForm()
    onClose()
    router.push('/race' as any)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Host Race</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Competitor Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Race Information</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>My Team Rating:</Text>
                <Text style={styles.infoValue}>{myTeamRating.toFixed(2)}★</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Competitor Rating:</Text>
                <Text style={styles.infoValue}>{competitorMean.toFixed(2)}★</Text>
              </View>
            </View>
          </View>

          {/* Track Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Track</Text>
            {tracks.length === 0 ? (
              <Text style={styles.emptyText}>No tracks available</Text>
            ) : (
              <View style={styles.optionsList}>
                {tracks.map((track: any) => (
                  <Pressable
                    key={track.id}
                    onPress={() => setSelectedTrackId(track.id)}
                    style={[
                      styles.optionItem,
                      selectedTrackId === track.id && styles.optionItemSelected,
                    ]}
                  >
                    <View style={styles.optionContent}>
                      <Text style={styles.optionText}>{track.name}</Text>
                      <Text style={styles.optionSubtext}>Rating: {track.rating.toFixed(1)}★</Text>
                    </View>
                    {selectedTrackId === track.id && (
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Field Size */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Field Size (Total Racers)</Text>
            <View style={styles.fieldSizeRow}>
              <Pressable
                onPress={() => setFieldSize(Math.max(10, fieldSize - 1))}
                disabled={fieldSize === 10}
                style={[styles.fieldSizeButton, fieldSize === 10 && styles.fieldSizeButtonDisabled]}
              >
                <Ionicons name="remove" size={24} color={fieldSize === 10 ? '#666' : '#fff'} />
              </Pressable>
              <Text style={styles.fieldSizeText}>{fieldSize}</Text>
              <Pressable
                onPress={() => setFieldSize(Math.min(20, fieldSize + 1))}
                disabled={fieldSize === 20}
                style={[styles.fieldSizeButton, fieldSize === 20 && styles.fieldSizeButtonDisabled]}
              >
                <Ionicons name="add" size={24} color={fieldSize === 20 ? '#666' : '#fff'} />
              </Pressable>
            </View>
            <Text style={styles.fieldSizeHint}>
              {eligibleDrivers.length} My Team + {fieldSize - eligibleDrivers.length} AI
            </Text>
          </View>

          {/* Laps Configuration */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Number of Laps</Text>
            <View style={styles.fieldSizeRow}>
              <Pressable
                onPress={() => setLaps(Math.max(3, laps - 1))}
                disabled={laps === 3}
                style={[styles.fieldSizeButton, laps === 3 && styles.fieldSizeButtonDisabled]}
              >
                <Ionicons name="remove" size={24} color={laps === 3 ? '#666' : '#fff'} />
              </Pressable>
              <Text style={styles.fieldSizeText}>{laps}</Text>
              <Pressable
                onPress={() => setLaps(Math.min(10, laps + 1))}
                disabled={laps === 10}
                style={[styles.fieldSizeButton, laps === 10 && styles.fieldSizeButtonDisabled]}
              >
                <Ionicons name="add" size={24} color={laps === 10 ? '#666' : '#fff'} />
              </Pressable>
            </View>
            <Text style={styles.fieldSizeHint}>
              Race completes when leader finishes {laps} laps
            </Text>
          </View>

          {/* Race Seed */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Race Seed</Text>
            <Text style={styles.sectionSubtext}>
              Unique race identifier for deterministic results (tap to copy)
            </Text>
            <Pressable onPress={handleCopySeed} style={styles.seedContainer}>
              <Text style={styles.seedText} numberOfLines={1}>
                {raceSeed}
              </Text>
              <Ionicons name="copy-outline" size={20} color="#4CAF50" />
            </Pressable>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color="#F44336" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {eligibleDrivers.length === 0 && (
            <View style={styles.warningBox}>
              <Ionicons name="information-circle" size={20} color="#FF9800" />
              <Text style={styles.warningText}>
                No eligible drivers. Hire drivers with valid contracts to host races.
              </Text>
            </View>
          )}

          {/* Start Button */}
          <Pressable
            onPress={handleStartRace}
            disabled={eligibleDrivers.length === 0 || !selectedTrackId}
            style={({ pressed }) => [
              styles.startButton,
              pressed && styles.startButtonPressed,
              (eligibleDrivers.length === 0 || !selectedTrackId) && styles.startButtonDisabled,
            ]}
          >
            <Text style={styles.startButtonText}>Start Race</Text>
            <Ionicons name="flag" size={20} color="#fff" />
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#1a1f27',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: -4,
  },
  infoCard: {
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  optionsList: {
    gap: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  optionItemSelected: {
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  optionSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    padding: 20,
  },
  fieldSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  fieldSizeButton: {
    backgroundColor: '#2e2e2e',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  fieldSizeButtonDisabled: {
    backgroundColor: '#1a1a1a',
    opacity: 0.5,
  },
  fieldSizeText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    minWidth: 60,
    textAlign: 'center',
  },
  fieldSizeHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  seedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  seedText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(244, 67, 54, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.4)',
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#F44336',
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.4)',
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  startButtonPressed: {
    opacity: 0.8,
  },
  startButtonDisabled: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
})
