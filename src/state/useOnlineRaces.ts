import Constants from 'expo-constants'
import { router } from 'expo-router'
import { io, Socket } from 'socket.io-client'
import { create } from 'zustand'

import { type RaceDriverSnapshot, useMyTeamRaces } from './useMyTeamRaces'
import { useTrackMaps } from './useTrackMaps'
import { useTracks } from './useTracks'

/**
 * Online race configuration
 */
export type OnlineRaceConfig = {
  raceID: string
  track: string
  laps: number
  aiCount: number
  userId: string
  grid?: { size: number; cells: string[] } // Optional, sent by host
}

/**
 * Driver information for online race
 */
export type OnlineRaceDriver = {
  name: string
  number: number
  rating: number
}

/**
 * Race state from server (matches server's RaceConfig type)
 */
export type OnlineRaceState = {
  raceID: string
  track: string
  laps: number
  aiCount: number
  drivers: OnlineRaceDriver[]
  hostUserId: string
  started: boolean
  updatedAt: number
  startedAt?: number
}

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

type OnlineRacesState = {
  socket: Socket | null
  connectionState: ConnectionState
  currentRace: OnlineRaceState | null
  isHost: boolean
  error: string | null

  // Actions
  connect: () => void
  disconnect: () => void
  createRace: (config: OnlineRaceConfig, callback?: (response: any) => void) => void
  joinRace: (raceID: string, userId: string, callback?: (response: any) => void) => void
  updateDrivers: (
    raceID: string,
    userId: string,
    drivers: OnlineRaceDriver[],
    callback?: (response: any) => void,
  ) => void
  startRace: (raceID: string, userId: string, callback?: (response: any) => void) => void
  setError: (error: string | null) => void
  reset: () => void
}

const getServerUrl = (): string => {
  const url =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_RACE_SERVER_URL ||
    process.env.EXPO_PUBLIC_RACE_SERVER_URL ||
    'http://localhost:3000'
  return url
}

export const useOnlineRaces = create<OnlineRacesState>((set, get) => ({
  socket: null,
  connectionState: 'disconnected',
  currentRace: null,
  isHost: false,
  error: null,

  connect: () => {
    const { socket: existingSocket } = get()

    // Don't create multiple connections
    if (existingSocket && existingSocket.connected) {
      return
    }

    set({ connectionState: 'connecting', error: null })

    const serverUrl = getServerUrl()
    console.log('[Online Races] Connecting to server:', serverUrl)
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'], // Use websocket first, fall back to polling for web
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    newSocket.on('connect', () => {
      console.log('[Online Races] ✓ Connected! Client ID:', newSocket.id)
      console.log('[Online Races] Server URL:', serverUrl)
      set({ connectionState: 'connected', error: null })
    })

    newSocket.on('disconnect', () => {
      console.log('[Online Races] Disconnected from server')
      set({ connectionState: 'disconnected' })
    })

    newSocket.on('connect_error', (error) => {
      console.error('[Online Races] Connection error:', error.message)
      set({
        connectionState: 'error',
        error: `Failed to connect to server: ${error.message}`,
      })
    })

    // Race events
    newSocket.on('race:state', (state: OnlineRaceState) => {
      console.log('[Online Races] Race state update:', state.raceID, 'Started:', state.started)
      // Don't update currentRace if we have a race actively running
      // The local simulation needs to complete independently
      const myTeamRacesState = useMyTeamRaces.getState()
      const activeRace = myTeamRacesState.getActiveRace()
      if (!activeRace || activeRace.state !== 'running') {
        set({ currentRace: state })
      } else {
        console.log('[Online Races] Ignoring race:state update - race still running locally')
      }
    })

    newSocket.on('race:started', (payload) => {
      console.log('[Online Races] Race started:', payload)
      const config = payload.config as OnlineRaceState & {
        grid?: { size: number; cells: string[] }
      }

      // Update current race state
      set((state) => ({
        currentRace: state.currentRace
          ? { ...state.currentRace, started: true, startedAt: payload.startedAt }
          : null,
      }))

      // Convert online race to HostedRace format and store in useMyTeamRaces
      if (config && config.drivers && config.drivers.length > 0) {
        let gridSize: number | undefined
        let gridCells: string[] | undefined
        let trackId: string | undefined
        // Use grid from server if present
        if (
          config.grid &&
          Array.isArray(config.grid.cells) &&
          typeof config.grid.size === 'number'
        ) {
          gridSize = config.grid.size
          gridCells = config.grid.cells
          trackId = `online_${config.raceID}`
        }
        // Only fallback to local track if grid is missing
        if ((!gridSize || !gridCells || !trackId) && config.track) {
          const tracksState = useTracks.getState()
          const track = tracksState.tracks.find((t: any) => t.name === config.track)
          if (track) {
            const trackMapsState = useTrackMaps.getState()
            trackMapsState.ensure(track.id)
            const localGrid = trackMapsState.get(track.id)
            if (localGrid) {
              gridSize = localGrid.size
              gridCells = localGrid.cells
              trackId = track.id
            }
          }
        }
        if (!gridSize || !gridCells || !trackId) {
          console.error('[Online Races] Track grid not available')
          return
        }
        // Extract track loop
        const trackLoop: number[] = []
        for (let i = 0; i < gridCells.length; i++) {
          if (gridCells[i] === 'track') {
            trackLoop.push(i)
          }
        }
        if (trackLoop.length === 0) {
          console.error('[Online Races] Track has no racing line:', trackId)
          return
        }
        const raceDrivers: RaceDriverSnapshot[] = config.drivers.map((driver, index) => ({
          driverId: `online_${driver.number}_${index}`,
          driverName: driver.name,
          driverNumber: driver.number,
          driverRating: driver.rating,
          carRating: driver.rating, // For online races, treat as equal
          effectiveRating: driver.rating,
          driverVariation: 0, // Will be calculated by race simulation
          isMyTeam: false, // All drivers in online race treated as competitors
        }))
        const hostedRace = {
          config: {
            id: config.raceID,
            seed: config.raceID, // Use race ID as seed for deterministic simulation
            trackId,
            trackLoop,
            trackWidth: gridSize,
            driverIds: [], // Not used for online races
            competitorMean: 3.0,
            fieldSize: config.drivers.length,
            laps: config.laps,
            createdAt: config.updatedAt,
          },
          state: 'running' as const,
          startedAt: payload.startedAt,
          drivers: raceDrivers,
          prestigeAwarded: false,
          isOnline: true, // Mark as online race - runs independently, no auto-cancel
        }
        // Store in useMyTeamRaces
        const myTeamRacesState = useMyTeamRaces.getState()
        myTeamRacesState.setActiveRace(hostedRace)
        // Navigate to race viewer
        router.push('/race' as any)
      }
    })

    newSocket.on('race:user_joined', (payload) => {
      console.log('[Online Races] User joined race:', payload.userId)
    })

    newSocket.on('race:closed', (payload) => {
      console.log('[Online Races] Race closed:', payload.raceID)
      // Don't clear currentRace if we have an active race running
      // Each client needs to finish their simulation independently
      const myTeamRacesState = useMyTeamRaces.getState()
      const activeRace = myTeamRacesState.getActiveRace()
      if (!activeRace || activeRace.state !== 'running') {
        set({ currentRace: null, isHost: false })
      } else {
        console.log('[Online Races] Ignoring race:closed - race still running locally')
      }
    })

    newSocket.on('race:error', (error) => {
      console.error('[Online Races] Race error:', error.message || error)
      set({ error: error.message || 'An error occurred' })
    })

    set({ socket: newSocket })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, connectionState: 'disconnected', currentRace: null, isHost: false })
    }
  },

  createRace: (config, callback) => {
    const { socket } = get()
    if (!socket || !socket.connected) {
      console.error('[Online Races] Cannot create race - not connected to server')
      set({ error: 'Not connected to server' })
      callback?.({ ok: false, error: 'Not connected to server' })
      return
    }

    console.log('[Online Races] Creating race:', config.raceID)
    set({ isHost: true, error: null })

    // Add timeout in case server doesn't respond
    const timeout = setTimeout(() => {
      console.error('[Online Races] Create race timeout - no response from server')
      const error = 'Server timeout - no response received'
      set({ error, isHost: false })
      callback?.({ ok: false, error })
    }, 10000) // 10 second timeout

    socket.emit('race:create', config, (response) => {
      clearTimeout(timeout)
      console.log('[Online Races] Create race response:', response)

      if (!response) {
        console.error('[Online Races] Empty response from server')
        const error = 'Empty response from server'
        set({ error, isHost: false })
        callback?.({ ok: false, error })
        return
      }

      if (response.ok) {
        set({ error: null })
      } else {
        set({ error: response.error || 'Failed to create race', isHost: false })
      }
      callback?.(response)
    })
  },

  joinRace: (raceID, userId, callback) => {
    const { socket } = get()
    if (!socket || !socket.connected) {
      console.error('[Online Races] Cannot join race - not connected to server')
      set({ error: 'Not connected to server' })
      callback?.({ ok: false, error: 'Not connected to server' })
      return
    }

    console.log('[Online Races] Joining race:', raceID)
    set({ isHost: false, error: null })

    const timeout = setTimeout(() => {
      console.error('[Online Races] Join race timeout')
      const error = 'Server timeout - no response received'
      set({ error })
      callback?.({ ok: false, error })
    }, 10000)

    socket.emit('race:join', { raceID, userId }, (response) => {
      clearTimeout(timeout)
      console.log('[Online Races] Join race response:', response)

      if (!response) {
        const error = 'Empty response from server'
        set({ error })
        callback?.({ ok: false, error })
        return
      }

      if (response.ok) {
        set({ error: null })
      } else {
        // If race not found, reset local race state so user isn't blocked
        if (response.error && response.error.toLowerCase().includes('race not found')) {
          try {
            const myTeamRacesState = require('./useMyTeamRaces').useMyTeamRaces.getState()
            myTeamRacesState.reset()
          } catch (e) {
            // ignore
          }
          set({ error: null }) // Clear error after reset so UI is unblocked
        } else {
          set({ error: response.error || 'Failed to join race' })
        }
      }
      callback?.(response)
    })
  },

  updateDrivers: (raceID, userId, drivers, callback) => {
    const { socket } = get()
    if (!socket || !socket.connected) {
      console.error('[Online Races] Cannot update drivers - not connected to server')
      set({ error: 'Not connected to server' })
      callback?.({ ok: false, error: 'Not connected to server' })
      return
    }

    console.log('[Online Races] Updating drivers for race:', raceID, '- Drivers:', drivers.length)

    const timeout = setTimeout(() => {
      console.error('[Online Races] Update drivers timeout')
      const error = 'Server timeout - no response received'
      set({ error })
      callback?.({ ok: false, error })
    }, 10000)

    socket.emit('race:drivers_update', { raceID, userId, drivers }, (response) => {
      clearTimeout(timeout)
      console.log('[Online Races] Update drivers response:', response)

      if (!response) {
        const error = 'Empty response from server'
        set({ error })
        callback?.({ ok: false, error })
        return
      }

      if (!response.ok) {
        set({ error: response.error || 'Failed to update drivers' })
      }
      callback?.(response)
    })
  },

  startRace: (raceID, userId, callback) => {
    const { socket } = get()
    if (!socket || !socket.connected) {
      set({ error: 'Not connected to server' })
      return
    }

    console.log('[Online Races] Starting race:', raceID)
    socket.emit('race:start', { raceID, userId }, (response) => {
      console.log('[Online Races] Start race response:', response)
      if (!response.ok) {
        set({ error: response.error || 'Failed to start race' })
      }
      callback?.(response)
    })
  },

  setError: (error) => {
    set({ error })
  },

  reset: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
    }
    set({
      socket: null,
      connectionState: 'disconnected',
      currentRace: null,
      isHost: false,
      error: null,
    })
  },
}))
