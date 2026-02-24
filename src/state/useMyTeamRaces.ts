import { useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

/**
 * Configuration for creating a hosted race
 */
export type HostedRaceConfig = {
  id: string // unique identifier for this race
  seed: string // seed for deterministic RNG
  trackId: string // which track to race on
  trackLoop: number[] // track loop geometry
  trackWidth: number // grid width
  driverIds: string[] // My Team driver IDs participating
  competitorMean: number // mean rating of AI competitors (0.5-5.0)
  fieldSize: number // total number of racers (My Team + AI), max 10
  laps: number // number of laps to complete, default 5
  createdAt: number // timestamp when race was created
}

/**
 * Driver performance snapshot at race start (deterministic)
 */
export type RaceDriverSnapshot = {
  driverId: string
  driverName: string
  driverNumber: number
  driverRating: number
  carRating: number
  effectiveRating: number // average of driver + car
  driverVariation: number // fixed per race from seed (-variance to +variance)
  contractExpiresAt?: number // snapshot of contract expiry
  isMyTeam: boolean // true for My Team drivers, false for AI
}

/**
 * Final result for one driver/car in a hosted race
 */
export type HostedRaceResultRow = {
  driverId: string // For My Team drivers, the driver ID; for AI, generated ID like "ai_1"
  driverName: string
  driverNumber: number
  position: number // 1-based finishing position
  laps: number
  finalProgress: number // used for sorting/gap calculation
  isMyTeam: boolean
  prestigeAwarded?: number // only set if My Team driver earned prestige
}

/**
 * State of a hosted race
 */
export type HostedRaceState = 'idle' | 'running' | 'finished'

/**
 * A complete hosted race record
 */
export type HostedRace = {
  config: HostedRaceConfig
  state: HostedRaceState
  startedAt?: number // timestamp when race actually started running
  finishedAt?: number // timestamp when race finished
  drivers: RaceDriverSnapshot[] // all drivers in the race (My Team + AI)
  results?: HostedRaceResultRow[] // final results, set when state becomes 'finished'
  prestigeAwarded: boolean // true if prestige has been awarded for this race
}

/**
 * Store state
 */
type MyTeamRacesState = {
  // Current active race (only one at a time)
  activeRace: HostedRace | null

  // Historical races (keep last 20)
  history: HostedRace[]

  // Competitor mean adjustment (simple ELO-like drift)
  // Starts at 0, adjusts up/down based on My Team performance
  competitorMeanAdjust: number

  // Actions
  createRace: (
    config: Omit<HostedRaceConfig, 'id' | 'createdAt'>,
  ) => { ok: true; race: HostedRace } | { ok: false; reason: string }
  startRace: () => { ok: true } | { ok: false; reason: string }
  finishRace: (results: HostedRaceResultRow[]) => void
  cancelRace: () => void
  awardPrestige: () =>
    | { ok: true; awards: { driverId: string; amount: number }[] }
    | { ok: false; reason: string }
  getActiveRace: () => HostedRace | null
  getHistory: () => HostedRace[]
  getCompetitorMean: () => number
  adjustCompetitorMean: (delta: number) => void
  reset: () => void
}

type MyTeamRacesData = Pick<MyTeamRacesState, 'activeRace' | 'history' | 'competitorMeanAdjust'>

type MyTeamRacesActions = Pick<
  MyTeamRacesState,
  | 'createRace'
  | 'startRace'
  | 'finishRace'
  | 'cancelRace'
  | 'awardPrestige'
  | 'getActiveRace'
  | 'getHistory'
  | 'getCompetitorMean'
  | 'adjustCompetitorMean'
  | 'reset'
>

/**
 * Calculate effective competitor mean for new races
 * Combines base rating (e.g., 2.0) with adjustment from past performance
 */
function calculateCompetitorMean(baseRating: number, adjust: number): number {
  // Clamp adjustment to reasonable range: -1.0 to +1.0
  const clampedAdjust = Math.max(-1.0, Math.min(1.0, adjust))
  // Final competitor mean clamped to valid range: 0.5 to 5.0
  return Math.max(0.5, Math.min(5.0, baseRating + clampedAdjust))
}

/**
 * Calculate prestige award for a finishing position in a race
 * Formula: scales with competitorMean and position
 * Target: ~20 prestige for 1st at 2★, ~100 prestige for 1st at 3★
 */
function calculatePrestigeAward(
  position: number,
  competitorMean: number,
  fieldSize: number,
): number {
  // Only award prestige for top 50% (and max 10 positions)
  const maxAwardPosition = Math.min(Math.ceil(fieldSize / 2), 10)
  if (position > maxAwardPosition) return 0

  // Base prestige scales exponentially with rating
  // At 2★: multiplier ~1, at 3★: multiplier ~5, at 4★: multiplier ~25
  const ratingMultiplier = Math.pow(5, competitorMean - 2.0)

  // Position multiplier: 1st gets 100%, 2nd gets 80%, etc.
  const positionMultiplier = Math.max(0.2, 1.0 - (position - 1) * 0.2)

  // Base amount for 1st place at 2★
  const baseAmount = 20

  const prestige = Math.round(baseAmount * ratingMultiplier * positionMultiplier)
  return Math.max(1, prestige)
}

/**
 * Calculate adjustment to competitor mean based on My Team results
 * If My Team does well -> increase competitor difficulty
 * If My Team does poorly -> decrease competitor difficulty
 */
function calculateCompetitorAdjustment(results: HostedRaceResultRow[], fieldSize: number): number {
  const myTeamResults = results.filter((r) => r.isMyTeam)
  if (myTeamResults.length === 0) return 0

  // Calculate average position of My Team drivers
  const avgPosition = myTeamResults.reduce((sum, r) => sum + r.position, 0) / myTeamResults.length

  // Expected position is middle of the field
  const expectedPosition = (fieldSize + 1) / 2

  // Difference: negative means better than expected, positive means worse
  const diff = avgPosition - expectedPosition

  // Convert to adjustment: -0.1 to +0.1 per race
  // If all My Team drivers finish in top half, adjust up
  // If all finish in bottom half, adjust down
  const adjustment = -diff * 0.02 // Scale factor

  return Math.max(-0.1, Math.min(0.1, adjustment))
}

const STORAGE_KEY = 'idle.myteamraces.v1'

function createInitialState(): MyTeamRacesData {
  return {
    activeRace: null,
    history: [],
    competitorMeanAdjust: 0,
  }
}

type Action =
  | { type: 'CREATE_RACE'; race: HostedRace }
  | { type: 'START_RACE'; startedAt: number }
  | { type: 'FINISH_RACE'; results: HostedRaceResultRow[]; finishedAt: number; adjustment: number }
  | { type: 'CANCEL_RACE' }
  | { type: 'AWARD_PRESTIGE' }
  | { type: 'ADJUST_COMPETITOR_MEAN'; delta: number }
  | { type: 'RESET' }

function reducer(state: MyTeamRacesData, action: Action): MyTeamRacesData {
  switch (action.type) {
    case 'CREATE_RACE': {
      return {
        ...state,
        activeRace: action.race,
      }
    }

    case 'START_RACE': {
      if (!state.activeRace) return state
      return {
        ...state,
        activeRace: {
          ...state.activeRace,
          state: 'running',
          startedAt: action.startedAt,
        },
      }
    }

    case 'FINISH_RACE': {
      if (!state.activeRace) return state

      const finishedRace: HostedRace = {
        ...state.activeRace,
        state: 'finished',
        finishedAt: action.finishedAt,
        results: action.results,
      }

      // Add to history (keep last 20)
      const newHistory = [finishedRace, ...state.history].slice(0, 20)

      return {
        ...state,
        activeRace: finishedRace,
        history: newHistory,
        competitorMeanAdjust: state.competitorMeanAdjust + action.adjustment,
      }
    }

    case 'CANCEL_RACE': {
      return {
        ...state,
        activeRace: null,
      }
    }

    case 'AWARD_PRESTIGE': {
      if (!state.activeRace) return state
      return {
        ...state,
        activeRace: {
          ...state.activeRace,
          prestigeAwarded: true,
        },
      }
    }

    case 'ADJUST_COMPETITOR_MEAN': {
      return {
        ...state,
        competitorMeanAdjust: Math.max(
          -1.0,
          Math.min(1.0, state.competitorMeanAdjust + action.delta),
        ),
      }
    }

    case 'RESET': {
      return createInitialState()
    }

    default:
      return state
  }
}

function createActions(
  dispatch: (action: Action) => void,
  getState: () => MyTeamRacesData,
): MyTeamRacesActions {
  return {
    createRace: (config: Omit<HostedRaceConfig, 'id' | 'createdAt'>) => {
      const state = getState()

      // Auto-cleanup expired races
      if (state.activeRace && state.activeRace.state === 'running') {
        if (!state.activeRace.startedAt) {
          // Race is running but has no start time (invalid state)
          dispatch({ type: 'CANCEL_RACE' })
        } else {
          const elapsed = (Date.now() - state.activeRace.startedAt) / 1000
          if (elapsed > 70) {
            // Race expired, cancel it first
            dispatch({ type: 'CANCEL_RACE' })
          }
        }
      }

      // Re-check state after cleanup
      const currentState = getState()

      // Check if there's already an active race
      if (currentState.activeRace && currentState.activeRace.state !== 'finished') {
        return { ok: false, reason: 'active_race_exists' }
      }

      // Validate config
      if (!config.trackId || config.trackLoop.length === 0) {
        return { ok: false, reason: 'invalid_track' }
      }

      if (config.driverIds.length === 0) {
        return { ok: false, reason: 'no_drivers' }
      }

      if (config.fieldSize < config.driverIds.length || config.fieldSize > 10) {
        return { ok: false, reason: 'invalid_field_size' }
      }

      // Create race with unique ID
      const id = `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const createdAt = Date.now()

      const race: HostedRace = {
        config: {
          ...config,
          id,
          createdAt,
        },
        state: 'idle',
        drivers: [], // Will be populated by the hook when race starts
        prestigeAwarded: false,
      }

      dispatch({ type: 'CREATE_RACE', race })

      return { ok: true, race }
    },

    startRace: () => {
      const state = getState()

      if (!state.activeRace) {
        return { ok: false, reason: 'no_active_race' }
      }

      if (state.activeRace.state !== 'idle') {
        return { ok: false, reason: 'race_already_started' }
      }

      dispatch({ type: 'START_RACE', startedAt: Date.now() })

      return { ok: true }
    },

    finishRace: (results: HostedRaceResultRow[]) => {
      const state = getState()

      if (!state.activeRace) return

      const adjustment = calculateCompetitorAdjustment(results, state.activeRace.config.fieldSize)

      dispatch({
        type: 'FINISH_RACE',
        results,
        finishedAt: Date.now(),
        adjustment,
      })
    },

    cancelRace: () => {
      dispatch({ type: 'CANCEL_RACE' })
    },

    awardPrestige: () => {
      const state = getState()
      const { usePrestige } = require('./usePrestige')

      if (!state.activeRace) {
        return { ok: false, reason: 'no_active_race' }
      }

      if (state.activeRace.state !== 'finished') {
        return { ok: false, reason: 'race_not_finished' }
      }

      if (state.activeRace.prestigeAwarded) {
        return { ok: false, reason: 'already_awarded' }
      }

      if (!state.activeRace.results) {
        return { ok: false, reason: 'no_results' }
      }

      const awards: { driverId: string; amount: number }[] = []
      const competitorMean = state.activeRace.config.competitorMean
      const fieldSize = state.activeRace.config.fieldSize

      // Award prestige to My Team drivers who finished in top 50%
      for (const result of state.activeRace.results) {
        if (result.isMyTeam) {
          const prestige = calculatePrestigeAward(result.position, competitorMean, fieldSize)
          if (prestige > 0) {
            awards.push({
              driverId: result.driverId,
              amount: prestige,
            })

            // Add to prestige store
            usePrestige.getState().addKnowledge(prestige)
          }
        }
      }

      dispatch({ type: 'AWARD_PRESTIGE' })

      return { ok: true, awards }
    },

    getActiveRace: () => {
      const race = getState().activeRace
      if (!race) return null

      // Auto-cleanup: if race is running without startedAt or for more than 70 seconds, cancel it
      if (race.state === 'running') {
        if (!race.startedAt) {
          // Race is running but has no start time (invalid state)
          dispatch({ type: 'CANCEL_RACE' })
          return null
        }
        const elapsed = (Date.now() - race.startedAt) / 1000
        if (elapsed > 70) {
          // Race expired, cancel it
          dispatch({ type: 'CANCEL_RACE' })
          return null
        }
      }

      return race
    },

    getHistory: () => {
      return getState().history
    },

    getCompetitorMean: () => {
      const state = getState()
      // Default base rating is 2.0
      return calculateCompetitorMean(2.0, state.competitorMeanAdjust)
    },

    adjustCompetitorMean: (delta: number) => {
      dispatch({ type: 'ADJUST_COMPETITOR_MEAN', delta })
    },

    reset: () => {
      dispatch({ type: 'RESET' })
    },
  }
}

let useMyTeamRaces: any

// Shared state implementation for all platforms
if (Platform.OS === 'web') {
  let state = createInitialState()
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.version === 1 && parsed.state) {
          state = { ...createInitialState(), ...parsed.state }
        }
      }
    } catch (e) {
      console.error('Failed to load my team races state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
    } catch (e) {
      console.error('Failed to save my team races state', e)
    }
  }

  const notify = () => {
    listeners.forEach((fn) => fn())
  }

  const getState = () => state

  const dispatch = (action: Action) => {
    state = reducer(state, action)
    saveToStorage()
    notify()
  }

  loadFromStorage()

  useMyTeamRaces = (selector?: (state: MyTeamRacesState) => any) => {
    const [, forceUpdate] = useReducer((x) => x + 1, 0)

    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])

    const fullState = { ...getState(), ...createActions(dispatch, getState) }
    return selector ? selector(fullState) : fullState
  }

  useMyTeamRaces.getState = () => ({ ...getState(), ...createActions(dispatch, getState) })
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { persist, createJSONStorage } = require('zustand/middleware') as any

  useMyTeamRaces = create()(
    persist(
      (set: any, get: any) => ({
        ...createInitialState(),

        createRace: (config: Omit<HostedRaceConfig, 'id' | 'createdAt'>) => {
          const state = get()

          // Auto-cleanup expired races
          if (
            state.activeRace &&
            state.activeRace.state === 'running' &&
            state.activeRace.startedAt
          ) {
            const elapsed = (Date.now() - state.activeRace.startedAt) / 1000
            if (elapsed > 70) {
              // Race expired, cancel it first
              set({ activeRace: null })
            }
          }

          // Re-check state after cleanup
          const currentState = get()

          if (currentState.activeRace && currentState.activeRace.state !== 'finished') {
            return { ok: false, reason: 'active_race_exists' }
          }

          if (!config.trackId || config.trackLoop.length === 0) {
            return { ok: false, reason: 'invalid_track' }
          }

          if (config.driverIds.length === 0) {
            return { ok: false, reason: 'no_drivers' }
          }

          if (config.fieldSize < config.driverIds.length || config.fieldSize > 10) {
            return { ok: false, reason: 'invalid_field_size' }
          }

          const id = `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          const createdAt = Date.now()

          const race: HostedRace = {
            config: {
              ...config,
              id,
              createdAt,
            },
            state: 'idle',
            drivers: [],
            prestigeAwarded: false,
          }

          set({ activeRace: race })

          return { ok: true, race }
        },

        startRace: () => {
          const state = get()

          if (!state.activeRace) {
            return { ok: false, reason: 'no_active_race' }
          }

          if (state.activeRace.state !== 'idle') {
            return { ok: false, reason: 'race_already_started' }
          }

          set({
            activeRace: {
              ...state.activeRace,
              state: 'running',
              startedAt: Date.now(),
            },
          })

          return { ok: true }
        },

        finishRace: (results: HostedRaceResultRow[]) => {
          const state = get()

          if (!state.activeRace) return

          const adjustment = calculateCompetitorAdjustment(
            results,
            state.activeRace.config.fieldSize,
          )

          const finishedRace: HostedRace = {
            ...state.activeRace,
            state: 'finished',
            finishedAt: Date.now(),
            results,
          }

          const newHistory = [finishedRace, ...state.history].slice(0, 20)

          set({
            activeRace: finishedRace,
            history: newHistory,
            competitorMeanAdjust: state.competitorMeanAdjust + adjustment,
          })
        },

        cancelRace: () => {
          set({ activeRace: null })
        },

        awardPrestige: () => {
          const state = get()
          const { usePrestige } = require('./usePrestige')

          if (!state.activeRace) {
            return { ok: false, reason: 'no_active_race' }
          }

          if (state.activeRace.state !== 'finished') {
            return { ok: false, reason: 'race_not_finished' }
          }

          if (state.activeRace.prestigeAwarded) {
            return { ok: false, reason: 'already_awarded' }
          }

          if (!state.activeRace.results) {
            return { ok: false, reason: 'no_results' }
          }

          const awards: { driverId: string; amount: number }[] = []
          const competitorMean = state.activeRace.config.competitorMean
          const fieldSize = state.activeRace.config.fieldSize

          for (const result of state.activeRace.results) {
            if (result.isMyTeam) {
              const prestige = calculatePrestigeAward(result.position, competitorMean, fieldSize)
              if (prestige > 0) {
                awards.push({
                  driverId: result.driverId,
                  amount: prestige,
                })

                usePrestige.getState().addKnowledge(prestige)
              }
            }
          }

          set({
            activeRace: {
              ...state.activeRace,
              prestigeAwarded: true,
            },
          })

          return { ok: true, awards }
        },

        getActiveRace: () => {
          const race = get().activeRace
          if (!race) return null

          // Auto-cleanup: if race is running without startedAt or for more than 70 seconds, cancel it
          if (race.state === 'running') {
            if (!race.startedAt) {
              // Race is running but has no start time (invalid state)
              set({ activeRace: null })
              return null
            }
            const elapsed = (Date.now() - race.startedAt) / 1000
            if (elapsed > 70) {
              // Race expired, cancel it
              set({ activeRace: null })
              return null
            }
          }

          return race
        },

        getHistory: () => get().history,

        getCompetitorMean: () => {
          const state = get()
          return calculateCompetitorMean(2.0, state.competitorMeanAdjust)
        },

        adjustCompetitorMean: (delta: number) => {
          const state = get()
          set({
            competitorMeanAdjust: Math.max(-1.0, Math.min(1.0, state.competitorMeanAdjust + delta)),
          })
        },

        reset: () => set(createInitialState()),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        version: 1,
      },
    ),
  )
}

export { calculateCompetitorMean, calculatePrestigeAward, useMyTeamRaces }
