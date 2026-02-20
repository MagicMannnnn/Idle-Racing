import { useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

import { useMoney } from './useMoney'
import { tierMult, useTracks } from './useTracks'

const MAX_LEVEL = 100

export type UpgradeMode = 'x1' | 'x10' | 'max'

export type Driver = {
  id: string
  name: string
  rating: number // 1-5 stars
  number: number // Driver's racing number (1-100)
  hiredAt: number
  hiringProgress?: number // 0-1 if currently hiring
  hiringStartedAt?: number
  cost: number
  contractExpiresAt?: number // timestamp when contract expires (only set after hiring completes)
}

export type UpgradeType =
  | 'engine'
  | 'transmission'
  | 'suspension'
  | 'brakes'
  | 'aerodynamics'
  | 'tires'

export type UpgradeTier = 'basic' | 'improved' | 'advanced' | 'elite' | 'ultimate'

export type CarUpgrade = {
  type: UpgradeType
  level: number
  tier: UpgradeTier
  value: number
  maxLevel: number
  upgrading?: boolean
  upgradeProgress?: number // 0-1 if currently upgrading
  upgradeStartedAt?: number
  upgradeTargetLevel?: number
}

export type HQ = {
  level: number
  upgrading: boolean
  upgradeProgress?: number // 0-1
  upgradeStartedAt?: number
  upgradeTargetLevel?: number
  maxDriverRating: number // 1-5, unlocks as HQ levels up
}

export type ActiveTeamRace = {
  trackId: string
  duration: number // minutes
  startedAt: number
  seed: number // for deterministic race simulation
  // Optional fields set when race finishes
  finishedAt?: number
  position?: number
  totalCars?: number
  teamAverageRating?: number
  knowledgeAwarded?: boolean // Track if knowledge points were already awarded for this race
}

export type RaceResult = {
  trackId: string
  trackName: string
  duration: number
  finishedAt: number
  position: number // 1-based, 1 = first place
  totalCars: number
  seed: number // For deterministic replay
  startedAt: number // When race started, for deterministic replay
}

export type LastTeamRace = {
  trackId: string
  trackName: string
  duration: number
  seed: number
  startedAt: number
  teamAverageRating: number
  position: number
  totalCars: number
}

type TeamState = {
  hq: HQ
  drivers: Driver[]
  upgrades: CarUpgrade[]
  activeRace?: ActiveTeamRace
  lastRaceResult?: RaceResult
  lastTeamRace?: LastTeamRace

  // HQ functions
  quoteHQUpgrade: () =>
    | {
        ok: true
        fromLevel: number
        toLevel: number
        cost: number
        time: number
        affordable: boolean
      }
    | { ok: false; reason: 'already_max' | 'already_upgrading' }
  upgradeHQ: () =>
    | { ok: true; cost: number; newLevel: number; time: number }
    | { ok: false; reason: 'already_max' | 'already_upgrading' | 'not_enough_money' }
  getHQUpgradeTimeReduction: () => number // 0-0.9

  // Driver functions
  getDriverSlots: () => number // equals maxDriverRating (1-5)

  // Team race functions
  startTeamRace: (
    trackId: string,
    duration: number,
  ) => { ok: true } | { ok: false; reason: 'no_drivers' | 'already_racing' }
  finishTeamRace: (
    position: number,
    totalCars: number,
    teamAverageRating: number,
    knowledgeAwarded?: boolean,
  ) => void
  clearTeamRace: () => void
  getActiveRace: () => ActiveTeamRace | undefined

  quoteDriver: (
    rating: number,
  ) =>
    | { ok: true; cost: number; time: number; affordable: boolean }
    | { ok: false; reason: 'slots_full' | 'rating_too_high' }
  hireDriver: (
    name: string,
    rating: number,
    number?: number,
  ) =>
    | { ok: true; driver: Driver; cost: number; time: number }
    | { ok: false; reason: 'slots_full' | 'not_enough_money' | 'rating_too_high' }
  fireDriver: (driverId: string) => { ok: true } | { ok: false; reason: 'not_found' }

  // Upgrade functions
  quoteCarUpgrade: (
    type: UpgradeType,
    mode: UpgradeMode,
  ) =>
    | {
        ok: true
        fromLevel: number
        toLevel: number
        levels: number
        cost: number
        time: number
        affordable: boolean
      }
    | { ok: false; reason: 'already_max' | 'already_upgrading' }
  upgradeCarByMode: (
    type: UpgradeType,
    mode: UpgradeMode,
  ) =>
    | { ok: true; cost: number; newLevel: number; time: number }
    | { ok: false; reason: 'already_max' | 'already_upgrading' | 'not_enough_money' }
  quoteTierUpgrade: (
    type: UpgradeType,
    tier: UpgradeTier,
  ) =>
    | { ok: true; cost: number; time: number; affordable: boolean }
    | { ok: false; reason: 'invalid_tier' | 'not_ready' }
  upgradeTier: (
    type: UpgradeType,
    tier: UpgradeTier,
  ) =>
    | { ok: true; cost: number; newTier: UpgradeTier; time: number }
    | { ok: false; reason: 'invalid_tier' | 'not_ready' | 'not_enough_money' }

  // General
  tick: (now: number) => void
  reset: () => void
}

// Cost and time formulas
function hqLevelCost(fromLevel: number, toLevel: number) {
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 1000 * (2 + Math.pow(4, Math.pow(lvl, 1.1)) * 2)
  }
  return Math.round(total)
}

function hqUpgradeTime(fromLevel: number, toLevel: number) {
  // Base time in seconds
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 30 + lvl * 10 // 40s, 50s, 60s, etc.
  }
  return total
}

function driverCost(rating: number) {
  // Exponential cost based on rating
  return Math.round(500 * Math.pow(5, rating - 1))
}

function driverHireTime(rating: number) {
  // Time in seconds
  return 20 + rating * 10 // 30s for 1-star, 70s for 5-star
}

function upgradeLevelCost(
  type: UpgradeType,
  fromLevel: number,
  toLevel: number,
  maxTrackIndex: number,
) {
  const baseMultiplier = {
    engine: 1.5,
    transmission: 1.3,
    suspension: 1.2,
    brakes: 1.1,
    aerodynamics: 1.4,
    tires: 1.0,
  }[type]

  // Use tierMult to scale with track progression, similar to track upgrades
  const trackMult = tierMult(maxTrackIndex)

  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 30 + baseMultiplier * Math.pow(lvl, 1.55) * 6 * trackMult
  }
  return Math.round(total)
}

function upgradeTime(type: UpgradeType, fromLevel: number, _toLevel: number) {
  // Fixed time based on current level, not multiplied by number of levels
  // This makes bulk upgrades take the same time as single upgrades
  const baseTime = 15
  const levelScaling = fromLevel * 5
  return baseTime + levelScaling
}

function tierCost(type: UpgradeType, tier: UpgradeTier, maxTrackIndex: number) {
  const multipliers = {
    engine: 1.0,
    transmission: 0.9,
    suspension: 0.8,
    brakes: 0.7,
    aerodynamics: 0.85,
    tires: 1.0,
  }

  // Scale tier unlock costs based on track progression
  // Basic = track 0-1, Improved = track 2-3, Advanced = track 5-7, Elite = track 10-15, Ultimate = track 20+
  const baseCosts = {
    basic: 0, // starting tier
    improved: 100,
    advanced: 1000,
    elite: 10000,
    ultimate: 100000,
  }

  // Scale the cost based on current progression
  const trackMult = tierMult(maxTrackIndex)
  return Math.floor(baseCosts[tier] * multipliers[type] * trackMult)
}

function tierTime(tier: UpgradeTier) {
  return {
    basic: 0,
    improved: 60,
    advanced: 120,
    elite: 300,
    ultimate: 600,
  }[tier]
}

function tierUpgradeValue(type: UpgradeType, tier: UpgradeTier, level: number) {
  // Return 0 at level 0
  if (level === 0) return 0

  const baseMultipliers = {
    basic: 1.0,
    improved: 1.3,
    advanced: 1.7,
    elite: 2.2,
    ultimate: 3.0,
  }

  const typeBase = {
    engine: 1.0,
    transmission: 0.8,
    suspension: 0.7,
    brakes: 0.6,
    aerodynamics: 0.9,
    tires: 1.0,
  }[type]

  return typeBase * baseMultipliers[tier] + (level - 1) * 0.1
}

function maxDriverRatingForHQ(hqLevel: number) {
  // HQ level 1: max 2-star, level 5: max 3-star, level 10: max 4-star, level 20: max 5-star
  if (hqLevel >= 20) return 5
  if (hqLevel >= 10) return 4
  if (hqLevel >= 5) return 3
  return 2
}

function getHQUpgradeTimeReduction(hqLevel: number) {
  // Up to 90% time reduction at max level
  return Math.min(0.9, hqLevel * 0.02)
}

function createInitialState(): Omit<TeamState, keyof ReturnType<typeof createActions>> {
  const upgrades: CarUpgrade[] = [
    { type: 'engine', level: 1, tier: 'basic', value: 1.0, maxLevel: MAX_LEVEL },
    { type: 'transmission', level: 1, tier: 'basic', value: 0.8, maxLevel: MAX_LEVEL },
    { type: 'suspension', level: 1, tier: 'basic', value: 0.7, maxLevel: MAX_LEVEL },
    { type: 'brakes', level: 1, tier: 'basic', value: 0.6, maxLevel: MAX_LEVEL },
    { type: 'aerodynamics', level: 1, tier: 'basic', value: 0.9, maxLevel: MAX_LEVEL },
    { type: 'tires', level: 1, tier: 'basic', value: 1.0, maxLevel: MAX_LEVEL },
  ]

  return {
    hq: {
      level: 1,
      upgrading: false,
      maxDriverRating: 2,
    },
    drivers: [],
    upgrades,
    activeRace: undefined,
    lastRaceResult: undefined,
    lastTeamRace: undefined,
  }
}

type Action =
  | { type: 'UPGRADE_HQ'; cost: number; toLevel: number; time: number; now: number }
  | { type: 'HIRE_DRIVER'; driver: Driver; cost: number; time: number; now: number }
  | { type: 'FIRE_DRIVER'; driverId: string }
  | { type: 'START_TEAM_RACE'; trackId: string; duration: number; now: number; seed: number }
  | {
      type: 'FINISH_TEAM_RACE'
      position: number
      totalCars: number
      teamAverageRating: number
      knowledgeAwarded?: boolean
    }
  | { type: 'CLEAR_TEAM_RACE' }
  | { type: 'STOP_TEAM_RACE'; result?: RaceResult; lastTeamRace?: LastTeamRace }
  | { type: 'CLEAR_RACE_RESULT' }
  | { type: 'SET_LAST_TEAM_RACE'; race: LastTeamRace }
  | { type: 'CLEAR_LAST_TEAM_RACE' }
  | {
      type: 'UPGRADE_CAR'
      upgradeType: UpgradeType
      cost: number
      toLevel: number
      time: number
      now: number
    }
  | {
      type: 'UPGRADE_TIER'
      upgradeType: UpgradeType
      cost: number
      newTier: UpgradeTier
      time: number
      now: number
    }
  | { type: 'TICK'; now: number }
  | { type: 'RESET' }

function reducer(
  state: Omit<TeamState, keyof ReturnType<typeof createActions>>,
  action: Action,
): Omit<TeamState, keyof ReturnType<typeof createActions>> {
  switch (action.type) {
    case 'UPGRADE_HQ': {
      return {
        ...state,
        hq: {
          ...state.hq,
          upgrading: true,
          upgradeProgress: 0,
          upgradeStartedAt: action.now,
          upgradeTargetLevel: action.toLevel,
        },
      }
    }

    case 'HIRE_DRIVER': {
      return {
        ...state,
        drivers: [
          ...state.drivers,
          {
            ...action.driver,
            hiringProgress: 0,
            hiringStartedAt: action.now,
          },
        ],
      }
    }

    case 'FIRE_DRIVER': {
      return {
        ...state,
        drivers: state.drivers.filter((d) => d.id !== action.driverId),
      }
    }

    case 'START_TEAM_RACE': {
      return {
        ...state,
        activeRace: {
          trackId: action.trackId,
          duration: action.duration,
          startedAt: action.now,
          seed: action.seed,
        },
        lastTeamRace: undefined, // Clear previous race results when starting new race
      }
    }

    case 'FINISH_TEAM_RACE': {
      if (!state.activeRace) return state
      return {
        ...state,
        activeRace: {
          ...state.activeRace,
          finishedAt: Date.now(),
          position: action.position,
          totalCars: action.totalCars,
          teamAverageRating: action.teamAverageRating,
          knowledgeAwarded: action.knowledgeAwarded ?? state.activeRace.knowledgeAwarded,
        },
      }
    }

    case 'CLEAR_TEAM_RACE': {
      return {
        ...state,
        activeRace: undefined,
      }
    }

    case 'STOP_TEAM_RACE': {
      return {
        ...state,
        activeRace: undefined,
        lastRaceResult: action.result,
        lastTeamRace: action.lastTeamRace ?? state.lastTeamRace,
      }
    }

    case 'CLEAR_RACE_RESULT': {
      return {
        ...state,
        lastRaceResult: undefined,
      }
    }

    case 'SET_LAST_TEAM_RACE': {
      return {
        ...state,
        lastTeamRace: action.race,
      }
    }

    case 'CLEAR_LAST_TEAM_RACE': {
      return {
        ...state,
        lastTeamRace: undefined,
      }
    }

    case 'UPGRADE_CAR': {
      return {
        ...state,
        upgrades: state.upgrades.map((u) =>
          u.type === action.upgradeType
            ? {
                ...u,
                upgrading: true,
                upgradeProgress: 0,
                upgradeStartedAt: action.now,
                upgradeTargetLevel: action.toLevel,
              }
            : u,
        ),
      }
    }

    case 'UPGRADE_TIER': {
      return {
        ...state,
        upgrades: state.upgrades.map((u) =>
          u.type === action.upgradeType
            ? {
                ...u,
                tier: action.newTier,
                level: 1,
                value: tierUpgradeValue(u.type, action.newTier, 1),
                upgrading: true,
                upgradeProgress: 0,
                upgradeStartedAt: action.now,
                upgradeTargetLevel: 1,
              }
            : u,
        ),
      }
    }

    case 'TICK': {
      let newState = { ...state }

      // Update HQ upgrade progress
      if (newState.hq.upgrading && newState.hq.upgradeStartedAt && newState.hq.upgradeTargetLevel) {
        const elapsed = (action.now - newState.hq.upgradeStartedAt) / 1000
        const timeReduction = getHQUpgradeTimeReduction(newState.hq.level)
        const totalTime =
          hqUpgradeTime(newState.hq.level, newState.hq.upgradeTargetLevel) * (1 - timeReduction)
        const progress = Math.min(1, elapsed / totalTime)

        if (progress >= 1) {
          // Upgrade complete
          newState.hq = {
            level: newState.hq.upgradeTargetLevel,
            upgrading: false,
            maxDriverRating: maxDriverRatingForHQ(newState.hq.upgradeTargetLevel),
          }
        } else {
          newState.hq = {
            ...newState.hq,
            upgradeProgress: progress,
          }
        }
      }

      // Update driver hiring progress
      newState.drivers = newState.drivers.map((driver) => {
        if (driver.hiringProgress !== undefined && driver.hiringStartedAt) {
          const elapsed = (action.now - driver.hiringStartedAt) / 1000
          const timeReduction = getHQUpgradeTimeReduction(newState.hq.level)
          const totalTime = driverHireTime(driver.rating) * (1 - timeReduction)
          const progress = Math.min(1, elapsed / totalTime)

          if (progress >= 1) {
            // Hiring complete - set 1 hour contract
            const {
              hiringProgress: _hiringProgress,
              hiringStartedAt: _hiringStartedAt,
              ...completedDriver
            } = driver
            return {
              ...completedDriver,
              contractExpiresAt: action.now + 3600000, // 1 hour from now
            }
          } else {
            return { ...driver, hiringProgress: progress }
          }
        }
        return driver
      })

      // Remove drivers whose contracts have expired
      newState.drivers = newState.drivers.filter((driver) => {
        if (driver.contractExpiresAt && action.now >= driver.contractExpiresAt) {
          return false // Remove expired driver
        }
        return true
      })

      // Update car upgrade progress
      newState.upgrades = newState.upgrades.map((upgrade) => {
        if (
          upgrade.upgrading &&
          upgrade.upgradeStartedAt &&
          upgrade.upgradeTargetLevel !== undefined
        ) {
          const elapsed = (action.now - upgrade.upgradeStartedAt) / 1000
          const timeReduction = getHQUpgradeTimeReduction(newState.hq.level)
          const totalTime =
            upgradeTime(upgrade.type, upgrade.level, upgrade.upgradeTargetLevel) *
            (1 - timeReduction)
          const progress = Math.min(1, elapsed / totalTime)

          if (progress >= 1) {
            // Upgrade complete
            return {
              type: upgrade.type,
              level: upgrade.upgradeTargetLevel,
              tier: upgrade.tier,
              value: tierUpgradeValue(upgrade.type, upgrade.tier, upgrade.upgradeTargetLevel),
              maxLevel: upgrade.maxLevel,
              upgrading: false,
            }
          } else {
            return { ...upgrade, upgradeProgress: progress }
          }
        }
        return upgrade
      })

      // Check if active race has ended (based on duration)
      // Don't clear if race has already been finished (results need to persist)
      if (newState.activeRace && !newState.activeRace.finishedAt) {
        const raceEndTime = newState.activeRace.startedAt + newState.activeRace.duration * 60 * 1000
        if (action.now >= raceEndTime) {
          newState.activeRace = undefined
        }
      }

      return newState
    }

    case 'RESET':
      return createInitialState()

    default:
      return state
  }
}

function createActions(
  dispatch: React.Dispatch<Action>,
  getState: () => Omit<TeamState, keyof ReturnType<typeof createActions>>,
) {
  const { canAfford, spend } = useMoney.getState()

  return {
    quoteHQUpgrade: () => {
      const state = getState()
      if (state.hq.upgrading) {
        return { ok: false as const, reason: 'already_upgrading' as const }
      }
      if (state.hq.level >= MAX_LEVEL) {
        return { ok: false as const, reason: 'already_max' as const }
      }

      const fromLevel = state.hq.level
      const toLevel = fromLevel + 1
      const cost = hqLevelCost(fromLevel, toLevel)
      const time = hqUpgradeTime(fromLevel, toLevel)

      return {
        ok: true as const,
        fromLevel,
        toLevel,
        cost,
        time,
        affordable: canAfford(cost),
      }
    },

    upgradeHQ: () => {
      const quote = createActions(dispatch, getState).quoteHQUpgrade()
      if (!quote.ok) return quote

      const cost = quote.cost as number
      const toLevel = quote.toLevel as number
      const time = quote.time as number

      if (!spend(cost)) {
        return { ok: false as const, reason: 'not_enough_money' as const }
      }

      dispatch({
        type: 'UPGRADE_HQ',
        cost,
        toLevel,
        time,
        now: Date.now(),
      })

      return {
        ok: true as const,
        cost,
        newLevel: toLevel,
        time,
      }
    },

    getHQUpgradeTimeReduction: () => {
      const state = getState()
      return getHQUpgradeTimeReduction(state.hq.level)
    },

    getDriverSlots: () => {
      const state = getState()
      return state.hq.maxDriverRating
    },

    quoteDriver: (rating: number) => {
      const state = getState()

      // Check if hiring in progress
      const hiringCount = state.drivers.filter((d) => d.hiringProgress !== undefined).length
      const hiredCount = state.drivers.filter((d) => d.hiringProgress === undefined).length
      const maxDrivers = state.hq.maxDriverRating

      if (hiringCount + hiredCount >= maxDrivers) {
        return { ok: false as const, reason: 'slots_full' as const }
      }

      if (rating > state.hq.maxDriverRating) {
        return { ok: false as const, reason: 'rating_too_high' as const }
      }

      const cost = driverCost(rating)
      const time = driverHireTime(rating)

      return {
        ok: true as const,
        cost,
        time,
        affordable: canAfford(cost),
      }
    },

    hireDriver: (name: string, rating: number, number?: number) => {
      const quote = createActions(dispatch, getState).quoteDriver(rating)
      if (!quote.ok) return quote

      const cost = quote.cost as number
      const time = quote.time as number

      if (!spend(cost)) {
        return { ok: false as const, reason: 'not_enough_money' as const }
      }

      // Generate random number 1-100 if not provided
      const driverNumber = number ?? Math.floor(Math.random() * 100) + 1

      const driver: Driver = {
        id: `driver-${Date.now()}-${Math.random()}`,
        name,
        rating,
        number: driverNumber,
        hiredAt: Date.now(),
        cost,
      }

      dispatch({
        type: 'HIRE_DRIVER',
        driver,
        cost,
        time,
        now: Date.now(),
      })

      return {
        ok: true as const,
        driver,
        cost,
        time,
      }
    },

    fireDriver: (driverId: string) => {
      const state = getState()
      const driver = state.drivers.find((d) => d.id === driverId)

      if (!driver) {
        return { ok: false as const, reason: 'not_found' as const }
      }

      dispatch({ type: 'FIRE_DRIVER', driverId })
      return { ok: true as const }
    },

    startTeamRace: (trackId: string, duration: number) => {
      const state = getState()
      const hiredDrivers = state.drivers.filter((d) => d.hiringProgress === undefined)

      if (hiredDrivers.length === 0) {
        return { ok: false as const, reason: 'no_drivers' as const }
      }

      // Only prevent if there's an unfinished race in progress
      if (state.activeRace && !state.activeRace.finishedAt) {
        return { ok: false as const, reason: 'already_racing' as const }
      }

      const now = Date.now()
      const seed = (now ^ (trackId.length << 16) ^ 0x9e3779b9) >>> 0

      dispatch({ type: 'START_TEAM_RACE', trackId, duration, now, seed })
      return { ok: true as const }
    },

    stopTeamRace: (result?: RaceResult, lastTeamRace?: LastTeamRace) => {
      dispatch({ type: 'STOP_TEAM_RACE', result, lastTeamRace })
    },

    finishTeamRace: (
      position: number,
      totalCars: number,
      teamAverageRating: number,
      knowledgeAwarded?: boolean,
    ) => {
      dispatch({
        type: 'FINISH_TEAM_RACE',
        position,
        totalCars,
        teamAverageRating,
        knowledgeAwarded,
      })
    },

    clearTeamRace: () => {
      dispatch({ type: 'CLEAR_TEAM_RACE' })
    },

    clearRaceResult: () => {
      dispatch({ type: 'CLEAR_RACE_RESULT' })
    },

    setLastTeamRace: (race: LastTeamRace) => {
      dispatch({ type: 'SET_LAST_TEAM_RACE', race })
    },

    clearLastTeamRace: () => {
      dispatch({ type: 'CLEAR_LAST_TEAM_RACE' })
    },

    getActiveRace: () => {
      return getState().activeRace
    },

    quoteCarUpgrade: (type: UpgradeType, mode: UpgradeMode) => {
      const state = getState()
      const upgrade = state.upgrades.find((u) => u.type === type)

      if (!upgrade) {
        return { ok: false as const, reason: 'already_max' as const }
      }

      if (upgrade.upgrading) {
        return { ok: false as const, reason: 'already_upgrading' as const }
      }

      if (upgrade.level >= MAX_LEVEL) {
        return { ok: false as const, reason: 'already_max' as const }
      }

      // Get max track index for scaling costs
      const tracks = useTracks.getState().tracks
      const maxTrackIndex = tracks.length > 0 ? Math.max(0, tracks.length - 1) : 0

      const fromLevel = upgrade.level
      let toLevel = fromLevel

      if (mode === 'x1') {
        toLevel = fromLevel + 1
      } else if (mode === 'x10') {
        toLevel = Math.min(MAX_LEVEL, fromLevel + 10)
      } else if (mode === 'max') {
        // Calculate the maximum affordable level
        const money = useMoney.getState().money
        let affordable = fromLevel

        for (let lvl = fromLevel + 1; lvl <= MAX_LEVEL; lvl++) {
          const costToLevel = upgradeLevelCost(type, fromLevel, lvl, maxTrackIndex)
          if (costToLevel <= money) {
            affordable = lvl
          } else {
            break
          }
        }

        toLevel = affordable
      }

      const cost = upgradeLevelCost(type, fromLevel, toLevel, maxTrackIndex)
      const time = upgradeTime(type, fromLevel, toLevel)

      return {
        ok: true as const,
        fromLevel,
        toLevel,
        levels: toLevel - fromLevel,
        cost,
        time,
        affordable: canAfford(cost),
      }
    },

    upgradeCarByMode: (type: UpgradeType, mode: UpgradeMode) => {
      const quote = createActions(dispatch, getState).quoteCarUpgrade(type, mode)
      if (!quote.ok) return quote

      const cost = quote.cost as number
      const toLevel = quote.toLevel as number
      const time = quote.time as number

      if (!spend(cost)) {
        return { ok: false as const, reason: 'not_enough_money' as const }
      }

      dispatch({
        type: 'UPGRADE_CAR',
        upgradeType: type,
        cost,
        toLevel,
        time,
        now: Date.now(),
      })

      return {
        ok: true as const,
        cost,
        newLevel: toLevel,
        time,
      }
    },

    quoteTierUpgrade: (type: UpgradeType, tier: UpgradeTier) => {
      const state = getState()
      const upgrade = state.upgrades.find((u) => u.type === type)

      if (!upgrade) {
        return { ok: false as const, reason: 'invalid_tier' as const }
      }

      const tierOrder: UpgradeTier[] = ['basic', 'improved', 'advanced', 'elite', 'ultimate']
      const currentIndex = tierOrder.indexOf(upgrade.tier)
      const targetIndex = tierOrder.indexOf(tier)

      if (targetIndex !== currentIndex + 1) {
        return { ok: false as const, reason: 'invalid_tier' as const }
      }

      if (upgrade.level < MAX_LEVEL) {
        return { ok: false as const, reason: 'not_ready' as const }
      }

      // Get max track index for scaling costs
      const tracks = useTracks.getState().tracks
      const maxTrackIndex = tracks.length > 0 ? Math.max(0, tracks.length - 1) : 0

      const cost = tierCost(type, tier, maxTrackIndex)
      const time = tierTime(tier)

      return {
        ok: true as const,
        cost,
        time,
        affordable: canAfford(cost),
      }
    },

    upgradeTier: (type: UpgradeType, tier: UpgradeTier) => {
      const quote = createActions(dispatch, getState).quoteTierUpgrade(type, tier)
      if (!quote.ok) return quote

      const cost = quote.cost as number
      const time = quote.time as number

      if (!spend(cost)) {
        return { ok: false as const, reason: 'not_enough_money' as const }
      }

      dispatch({
        type: 'UPGRADE_TIER',
        upgradeType: type,
        cost,
        newTier: tier,
        time,
        now: Date.now(),
      })

      return {
        ok: true as const,
        cost,
        newTier: tier,
        time,
      }
    },

    tick: (now: number) => {
      dispatch({ type: 'TICK', now })
    },

    reset: () => {
      dispatch({ type: 'RESET' })
    },
  }
}

const STORAGE_KEY = 'idle.team.v1'

let useTeam: any

// Shared state implementation for all platforms
let state = createInitialState()
const listeners = new Set<() => void>()

const loadFromStorage = async () => {
  try {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.version === 1 && parsed.state) {
          state = { ...createInitialState(), ...parsed.state }
        }
      }
    } else {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.version === 1 && parsed.state) {
          state = { ...createInitialState(), ...parsed.state }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load team state', e)
  }
}

const saveToStorage = () => {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
    } else {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 })).catch((e: any) => {
        console.error('Failed to save team state', e)
      })
    }
  } catch (e) {
    console.error('Failed to save team state', e)
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

useTeam = (selector?: (state: TeamState) => any) => {
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

useTeam.getState = () => ({ ...getState(), ...createActions(dispatch, getState) })

export { useTeam }
