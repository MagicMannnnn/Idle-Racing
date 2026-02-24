import { Ionicons } from '@expo/vector-icons'
import { useOnlineRaces } from '@state/useOnlineRaces'
import { useTeam } from '@state/useTeam'
import React, { useEffect, useMemo, useState } from 'react'
import {
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

export function JoinOnlineRaceModal({ visible, onClose }: Props) {
  const drivers = useTeam((s: any) => s.drivers)
  const upgrades = useTeam((s: any) => s.upgrades)

  const { connect, joinRace, updateDrivers, connectionState, currentRace, error, setError } =
    useOnlineRaces()

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
  const [localError, setLocalError] = useState('')
  const [joining, setJoining] = useState(false)

  // Connect to server when modal opens
  useEffect(() => {
    if (visible) {
      connect()
    }
  }, [visible, connect])

  // Auto-close modal when race starts (navigation handled by socket listener)
  useEffect(() => {
    if (currentRace?.started && joining) {
      handleClose()
    }
  }, [currentRace?.started, joining])

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

  // Reset form
  const resetForm = () => {
    setRaceID('')
    setLocalError('')
    setError(null)
    setJoining(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleJoinRace = () => {
    setLocalError('')
    setError(null)

    // Validation
    if (!raceID.trim()) {
      setLocalError('Please enter a race ID')
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

    setJoining(true)

    // Generate a unique user ID (in production, this would come from authentication)
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Join race on server
    joinRace(raceID.trim(), userId, (response) => {
      setJoining(false)

      if (response.ok) {
        // Update drivers for this race
        updateDrivers(raceID.trim(), userId, onlineDrivers, (driverResponse) => {
          if (driverResponse.ok) {
            // Successfully joined - lobby will show automatically via currentRace state
            setLocalError('')
          } else {
            setLocalError('Failed to update drivers')
          }
        })
      } else {
        setLocalError(response.error || 'Failed to join race')
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
          <Text style={styles.title}>Join Online Race</Text>
          <Pressable onPress={handleClose} hitSlop={10}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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

          {/* Race ID Input */}
          {!currentRace && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Race ID</Text>
                <Text style={styles.sectionSubtext}>Enter the race ID provided by the host</Text>
                <TextInput
                  style={styles.raceIDInput}
                  value={raceID}
                  onChangeText={setRaceID}
                  placeholder="Enter race ID"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoCapitalize="characters"
                  editable={!joining}
                />
              </View>

              {/* My Team Drivers */}
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
            </>
          )}

          {/* Race Info (if joined) */}
          {currentRace && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Race Information</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Race ID:</Text>
                    <Text style={styles.infoValue}>{currentRace.raceID}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Track:</Text>
                    <Text style={styles.infoValue}>{currentRace.track}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Laps:</Text>
                    <Text style={styles.infoValue}>{currentRace.laps}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Status:</Text>
                    <Text
                      style={[
                        styles.infoValue,
                        currentRace.started && styles.infoValueRunning,
                        !currentRace.started && styles.infoValueWaiting,
                      ]}
                    >
                      {currentRace.started ? 'RUNNING' : 'WAITING'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Race Drivers */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Total Drivers ({currentRace.drivers.length})
                </Text>
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
              </View>

              {!currentRace.started && (
                <View style={styles.infoBox}>
                  <Ionicons name="time-outline" size={20} color="#FF9800" />
                  <Text style={styles.infoText}>Waiting for host to start the race...</Text>
                </View>
              )}

              {currentRace.started && (
                <View style={styles.successBox}>
                  <Ionicons name="flag" size={20} color="#4CAF50" />
                  <Text style={styles.successText}>
                    Race in progress! View the race to see live updates.
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Error */}
          {displayError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color="#F44336" />
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          ) : null}

          {eligibleDrivers.length === 0 && !currentRace && (
            <View style={styles.warningBox}>
              <Ionicons name="information-circle" size={20} color="#FF9800" />
              <Text style={styles.warningText}>
                No eligible drivers. Hire drivers with valid contracts to join races.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          {!currentRace ? (
            <Pressable
              onPress={handleJoinRace}
              disabled={
                eligibleDrivers.length === 0 ||
                connectionState !== 'connected' ||
                !raceID.trim() ||
                joining
              }
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.startButtonPressed,
                (eligibleDrivers.length === 0 ||
                  connectionState !== 'connected' ||
                  !raceID.trim() ||
                  joining) &&
                  styles.startButtonDisabled,
              ]}
            >
              <Text style={styles.startButtonText}>{joining ? 'Joining...' : 'Join Race'}</Text>
              <Ionicons name="enter" size={20} color="#fff" />
            </Pressable>
          ) : currentRace.started ? (
            <Pressable
              onPress={() => {
                handleClose()
                // Navigate to race view (would need to implement online race viewer)
                // router.push('/race' as any)
              }}
              style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
            >
              <Text style={styles.startButtonText}>View Race</Text>
              <Ionicons name="eye" size={20} color="#fff" />
            </Pressable>
          ) : null}
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
  raceIDInput: {
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
  infoValueRunning: {
    color: '#4CAF50',
  },
  infoValueWaiting: {
    color: '#FF9800',
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
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    padding: 20,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.4)',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  successText: {
    flex: 1,
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
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
