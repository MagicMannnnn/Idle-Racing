import { Ionicons } from '@expo/vector-icons'
import { useOnlineRaces } from '@state/useOnlineRaces'
import { useTeam } from '@state/useTeam'
import { useTracks } from '@state/useTracks'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Clipboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

type Props = {
  visible: boolean
  onClose: () => void
}

export function HostOnlineRaceModal({ visible, onClose }: Props) {
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)
  const tracks = useTracks((s: any) => s.tracks)

  const {
    connect,
    createRace,
    updateDrivers,
    startRace,
    connectionState,
    currentRace,
    error,
    setError,
  } = useOnlineRaces()

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

  const [raceID, setRaceID] = useState('')
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [laps, setLaps] = useState(3)
  const [localError, setLocalError] = useState('')
  const [inLobby, setInLobby] = useState(false)
  const [hostUserId, setHostUserId] = useState('')

  // Generate random race ID
  useEffect(() => {
    if (visible && !raceID) {
      const id = `RACE${Math.random().toString(36).substr(2, 6).toUpperCase()}`
      setRaceID(id)
    }
  }, [visible])

  // Connect to server when modal opens
  useEffect(() => {
    if (visible) {
      connect()
    }
  }, [visible, connect])

  // Calculate car rating
  const carRating = useMemo(() => {
    return upgrades.reduce((sum: number, u: any) => sum + u.value, 0) / upgrades.length
  }, [upgrades])

  // Convert drivers to online race format
  const onlineDrivers = useMemo(() => {
    return eligibleDrivers.map((d: any) => ({
      name: d.name,
      number: d.number,
      rating: (d.rating + carRating) / 2, // Average of driver and car rating
    }))
  }, [eligibleDrivers, carRating])

  // Copy race ID to clipboard
  const handleCopyRaceID = () => {
    Clipboard.setString(raceID)
    if (Platform.OS !== 'web') {
      Alert.alert('Copied!', `Race ID "${raceID}" copied to clipboard`)
    }
  }

  // Reset form
  const resetForm = () => {
    setRaceID('')
    setSelectedTrackId(null)
    setLaps(3)
    setLocalError('')
    setError(null)
    setInLobby(false)
    setHostUserId('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleCreateRace = () => {
    setLocalError('')
    setError(null)

    // Validation
    if (!raceID.trim()) {
      setLocalError('Please enter a race ID')
      return
    }

    if (!selectedTrackId) {
      setLocalError('Please select a track')
      return
    }

    if (eligibleDrivers.length === 0) {
      setLocalError('No eligible drivers available')
      return
    }

    if (connectionState !== 'connected') {
      setLocalError('Not connected to server')
      return
    }

    // Get track data
    const track = tracks.find((t: any) => t.id === selectedTrackId)
    if (!track) {
      setLocalError('Invalid track selected')
      return
    }

    // Generate a unique user ID (in production, this would come from authentication)
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    console.log('[HostOnlineRaceModal] Creating race with config:', {
      raceID: raceID.trim(),
      track: track.name,
      laps,
      aiCount: 0,
      userId,
    })

    // Create race on server
    createRace(
      {
        raceID: raceID.trim(),
        track: track.name,
        laps,
        aiCount: 0,
        userId,
      },
      (response) => {
        console.log('[HostOnlineRaceModal] Create race response:', response)
        if (response.ok) {
          console.log('[HostOnlineRaceModal] Race created successfully, updating drivers...')
          // Update drivers for this race
          updateDrivers(raceID.trim(), userId, onlineDrivers, (driverResponse) => {
            console.log('[HostOnlineRaceModal] Update drivers response:', driverResponse)
            if (driverResponse.ok) {
              console.log('[HostOnlineRaceModal] Entering lobby mode')
              // Enter lobby mode
              setInLobby(true)
              setHostUserId(userId)
              setLocalError('')
            } else {
              console.error('[HostOnlineRaceModal] Failed to update drivers:', driverResponse)
              setLocalError('Failed to update drivers')
            }
          })
        } else {
          console.error('[HostOnlineRaceModal] Failed to create race:', response)
          setLocalError(response.error || 'Failed to create race')
        }
      },
    )
  }

  const handleStartRace = () => {
    if (!raceID.trim() || !hostUserId) {
      setLocalError('No race created yet')
      return
    }

    startRace(raceID.trim(), hostUserId, (response) => {
      if (response.ok) {
        // Race started successfully
        handleClose()
        // Navigate to race view (would need to implement online race viewer)
        // router.push('/race' as any)
      } else {
        setLocalError(response.error || 'Failed to start race')
      }
    })
  }

  const displayError = localError || error

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Host Online Race</Text>
          <Pressable onPress={handleClose} hitSlop={10}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Lobby Header - Show when race is created */}
          {inLobby && (
            <View style={styles.lobbyHeader}>
              <View style={styles.lobbyHeaderTop}>
                <Ionicons name="trophy" size={24} color="#4CAF50" />
                <Text style={styles.lobbyHeaderTitle}>Race Lobby</Text>
              </View>
              <Text style={styles.lobbyHeaderSubtitle}>Share this Race ID with other players</Text>
              <View style={styles.raceIDRow}>
                <Text style={styles.raceIDText}>{raceID}</Text>
                <Pressable onPress={handleCopyRaceID} style={styles.copyButton}>
                  <Ionicons name="copy-outline" size={20} color="#4CAF50" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Connection Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Server Status</Text>
            <View
              style={[
                styles.statusBadge,
                connectionState === 'connected' && styles.statusConnected,
                connectionState === 'connecting' && styles.statusConnecting,
                connectionState === 'error' && styles.statusError,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  connectionState === 'connected' && styles.statusDotConnected,
                  connectionState === 'connecting' && styles.statusDotConnecting,
                  connectionState === 'error' && styles.statusDotError,
                ]}
              />
              <Text style={styles.statusText}>
                {connectionState === 'connected' && 'Connected'}
                {connectionState === 'connecting' && 'Connecting...'}
                {connectionState === 'disconnected' && 'Disconnected'}
                {connectionState === 'error' && 'Connection Error'}
              </Text>
            </View>

            {/* Show help message if not connected */}
            {(connectionState === 'error' || connectionState === 'disconnected') && (
              <View style={styles.warningBox}>
                <Ionicons name="information-circle" size={20} color="#FF9800" />
                <Text style={styles.warningText}>
                  Make sure the race server is running on{' '}
                  {process.env.EXPO_PUBLIC_RACE_SERVER_URL || 'http://localhost:3000'}
                </Text>
              </View>
            )}
          </View>

          {/* Race ID - Only show before race is created */}
          {!inLobby && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Race ID</Text>
              <Text style={styles.sectionSubtext}>
                Share this ID with other players to let them join
              </Text>
              <View style={styles.raceIDRow}>
                <TextInput
                  style={styles.raceIDInput}
                  value={raceID}
                  onChangeText={setRaceID}
                  placeholder="Enter race ID"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoCapitalize="characters"
                  editable={!currentRace}
                />
                <Pressable onPress={handleCopyRaceID} style={styles.copyButton}>
                  <Ionicons name="copy-outline" size={20} color="#4CAF50" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Track Selection - Only show before race is created */}
          {!inLobby && (
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
                      disabled={!!currentRace}
                      style={[
                        styles.optionItem,
                        selectedTrackId === track.id && styles.optionItemSelected,
                        currentRace && styles.optionItemDisabled,
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
          )}

          {/* Laps Configuration - Only show before race is created */}
          {!inLobby && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Number of Laps</Text>
              <View style={styles.fieldSizeRow}>
                <Pressable
                  onPress={() => setLaps(Math.max(3, laps - 1))}
                  disabled={laps === 3 || !!currentRace}
                  style={[
                    styles.fieldSizeButton,
                    (laps === 3 || currentRace) && styles.fieldSizeButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name="remove"
                    size={24}
                    color={laps === 3 || currentRace ? '#666' : '#fff'}
                  />
                </Pressable>
                <Text style={styles.fieldSizeText}>{laps}</Text>
                <Pressable
                  onPress={() => setLaps(Math.min(10, laps + 1))}
                  disabled={laps === 10 || !!currentRace}
                  style={[
                    styles.fieldSizeButton,
                    (laps === 10 || currentRace) && styles.fieldSizeButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name="add"
                    size={24}
                    color={laps === 10 || currentRace ? '#666' : '#fff'}
                  />
                </Pressable>
              </View>
              <Text style={styles.fieldSizeHint}>
                Race completes when leader finishes {laps} laps
              </Text>
            </View>
          )}

          {/* My Team Drivers - Only show before race is created */}
          {!inLobby && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Drivers ({eligibleDrivers.length})</Text>
              {eligibleDrivers.length === 0 ? (
                <Text style={styles.emptyText}>No eligible drivers available</Text>
              ) : (
                <View style={styles.driversList}>
                  {eligibleDrivers.slice(0, 5).map((driver: any) => (
                    <View key={driver.id} style={styles.driverItem}>
                      <Text style={styles.driverNumber}>#{driver.number}</Text>
                      <Text style={styles.driverName}>{driver.name}</Text>
                      <Text style={styles.driverRating}>{driver.rating.toFixed(1)}★</Text>
                    </View>
                  ))}
                  {eligibleDrivers.length > 5 && (
                    <Text style={styles.moreDriversText}>+{eligibleDrivers.length - 5} more</Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Race Participants - Show in lobby */}
          {inLobby && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Total Drivers ({currentRace?.drivers?.length || 0})
              </Text>
              {currentRace?.drivers && currentRace.drivers.length > 0 ? (
                <View style={styles.participantsList}>
                  {currentRace.drivers.map((driver, index) => (
                    <View
                      key={`${driver.name}-${driver.number}-${index}`}
                      style={styles.participantItem}
                    >
                      <Ionicons name="car-sport" size={20} color="#2196F3" />
                      <Text style={styles.participantText}>
                        #{driver.number} {driver.name}
                      </Text>
                      <Text style={styles.participantDriverCount}>Rating: {driver.rating}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Waiting for race data...</Text>
              )}
            </View>
          )}

          {/* Error */}
          {displayError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color="#F44336" />
              <Text style={styles.errorText}>{displayError}</Text>
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

          {/* Action Buttons */}
          {!inLobby ? (
            <Pressable
              onPress={handleCreateRace}
              disabled={
                eligibleDrivers.length === 0 ||
                !selectedTrackId ||
                connectionState !== 'connected' ||
                !raceID.trim()
              }
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.startButtonPressed,
                (eligibleDrivers.length === 0 ||
                  !selectedTrackId ||
                  connectionState !== 'connected' ||
                  !raceID.trim()) &&
                  styles.startButtonDisabled,
              ]}
            >
              <Text style={styles.startButtonText}>Create Race</Text>
              <Ionicons name="add-circle" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleStartRace}
              disabled={(currentRace?.drivers?.length || 0) < 1}
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.startButtonPressed,
                (currentRace?.drivers?.length || 0) < 1 && styles.startButtonDisabled,
              ]}
            >
              <Text style={styles.startButtonText}>
                {(currentRace?.drivers?.length || 0) < 1 ? 'Add drivers to start...' : 'Start Race'}
              </Text>
              <Ionicons name="flag" size={20} color="#fff" />
            </Pressable>
          )}
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusConnected: {
    borderColor: 'rgba(76, 175, 80, 0.4)',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  statusConnecting: {
    borderColor: 'rgba(255, 152, 0, 0.4)',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
  },
  statusError: {
    borderColor: 'rgba(244, 67, 54, 0.4)',
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#666',
  },
  statusDotConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDotConnecting: {
    backgroundColor: '#FF9800',
  },
  statusDotError: {
    backgroundColor: '#F44336',
  },
  statusText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  raceIDRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  raceIDInput: {
    flex: 1,
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  copyButton: {
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
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
  optionItemDisabled: {
    opacity: 0.5,
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
  driversList: {
    gap: 8,
  },
  driverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  driverNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4CAF50',
    minWidth: 35,
  },
  driverName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  driverRating: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  moreDriversText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  participantsList: {
    gap: 8,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1f27',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  participantText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  participantDriverCount: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
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
  lobbyHeader: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  lobbyHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lobbyHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#4CAF50',
  },
  lobbyHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  raceIDText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
})
