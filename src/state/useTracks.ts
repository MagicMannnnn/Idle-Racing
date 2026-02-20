import { useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

import { useMoney } from './useMoney'

const MIN_LEVEL = 1
const MAX_LEVEL = 100

export type UpgradeMode = 'x1' | 'x10' | 'max'

export type Track = {
  id: string
  index: number
  name: string

  rating: number
  maxRating: number

  capacityLevel: number
  capacity: number
  maxCapacity: number

  safetyLevel: number
  safety: number
  maxSafety: number

  entertainmentLevel: number
  entertainment: number
  maxEntertainment: number

  trackSize: number
}

type UpgradeQuote =
  | {
      ok: true
      fromLevel: number
      toLevel: number
      levels: number
      cost: number
      affordable: boolean
    }
  | { ok: false; reason: 'already_max' }

type TracksState = {
  tracks: Track[]

  nextTrackCost: () => number
  canBuyNextTrack: () => boolean
  buyNextTrack: (
    name: string,
  ) => { ok: true; track: Track; cost: number } | { ok: false; reason: 'not_enough_money' }

  quoteCapacityUpgrade: (
    trackId: string,
    mode: UpgradeMode,
  ) => UpgradeQuote | { ok: false; reason: 'not_found' }
  quoteSafetyUpgrade: (
    trackId: string,
    mode: UpgradeMode,
  ) => UpgradeQuote | { ok: false; reason: 'not_found' }
  quoteEntertainmentUpgrade: (
    trackId: string,
    mode: UpgradeMode,
  ) => UpgradeQuote | { ok: false; reason: 'not_found' }

  upgradeCapacityByMode: (
    trackId: string,
    mode: UpgradeMode,
  ) =>
    | { ok: true; cost: number; newLevel: number }
    | { ok: false; reason: 'not_found' | 'already_max' | 'not_enough_money' }

  upgradeSafetyByMode: (
    trackId: string,
    mode: UpgradeMode,
  ) =>
    | { ok: true; cost: number; newLevel: number }
    | { ok: false; reason: 'not_found' | 'already_max' | 'not_enough_money' }

  upgradeEntertainmentByMode: (
    trackId: string,
    mode: UpgradeMode,
  ) =>
    | { ok: true; cost: number; newLevel: number }
    | { ok: false; reason: 'not_found' | 'already_max' | 'not_enough_money' }

  getById: (trackId: string) => Track | undefined
  reset: () => void
}

function trackCostForIndex(index: number) {
  return Math.round(100 * Math.pow(10, index))
}

export function tierMult(index: number) {
  return index === 0 ? 0.3 : 2 + Math.pow(4, Math.pow(index, 1.1)) * 2
}

function capacityBaseForIndex(index: number) {
  return 10 + index * 100
}
function capacityMaxForIndex(index: number) {
  return 250 + index * 250 * 10
}

function safetyBaseForIndex(index: number) {
  return 1.0 + index * 0.1
}
function safetyMaxForIndex(index: number) {
  return 2.0 + index * 0.5
}

function entertainmentBaseForIndex(index: number) {
  return 5 + index * 2
}
function entertainmentMaxForIndex(index: number) {
  return 35 + index * 5
}

export function capacityLevelCost(index: number, fromLevel: number, toLevel: number) {
  const mult = tierMult(index)
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 30 + Math.pow(lvl, 1.55) * 6 * mult
  }
  return Math.round(total)
}

function safetyLevelCost(index: number, fromLevel: number, toLevel: number) {
  const mult = tierMult(index)
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 45 + Math.pow(lvl, 1.35) * 7 * mult
  }
  return Math.round(total)
}

function entertainmentLevelCost(index: number, fromLevel: number, toLevel: number) {
  const mult = tierMult(index)
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 40 + (Math.pow(lvl, 1.25) * 8 + Math.pow(lvl / 12, 3) * 120) * mult
  }
  return Math.round(total)
}

function trackMaxStars(index: number) {
  return Math.min(5, 3.6 + index * 0.6)
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function lerpByLevel(level: number, base: number, max: number) {
  const t = (clamp(level, MIN_LEVEL, MAX_LEVEL) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL)
  return base + (max - base) * t
}

function capacityFor(index: number, level: number) {
  const base = capacityBaseForIndex(index)
  const max = capacityMaxForIndex(index)
  return Math.round(lerpByLevel(level, base, max))
}

function safetyFor(index: number, level: number) {
  const base = safetyBaseForIndex(index)
  const max = safetyMaxForIndex(index)
  return Math.round(lerpByLevel(level, base, max) * 100) / 100
}

function entertainmentFor(index: number, level: number) {
  const base = entertainmentBaseForIndex(index)
  const max = entertainmentMaxForIndex(index)
  return Math.round(lerpByLevel(level, base, max))
}

function computeRatingPrecise(t: Track) {
  const capN = clamp01((t.capacity - 10) / t.maxCapacity)
  const safN = clamp01((t.safety - 1) / 5)
  const entN = clamp01((t.entertainment - 5) / 100)

  const score = ((capN + entN) / 2) * 0.75 + safN * 0.25

  const maxStars = trackMaxStars(t.index)
  const minStars = 1.0
  const raw = minStars + (maxStars - minStars) * score

  return Math.round(raw * 100) / 100
}

function quoteUpgrade(
  index: number,
  from: number,
  mode: UpgradeMode,
  costFn: (i: number, a: number, b: number) => number,
): UpgradeQuote {
  if (from >= MAX_LEVEL) return { ok: false as const, reason: 'already_max' }

  const canAfford = (cost: number) => useMoney.getState().canAfford(cost)
  if (mode === 'x1' || mode === 'x10') {
    const target = clamp(from + (mode === 'x1' ? 1 : 10), MIN_LEVEL, MAX_LEVEL)
    const levels = target - from
    const cost = costFn(index, from, target)
    return {
      ok: true as const,
      fromLevel: from,
      toLevel: target,
      levels,
      cost,
      affordable: canAfford(cost),
    }
  }
  const money = useMoney.getState().money

  let lo = from + 1
  let hi = MAX_LEVEL
  let best = from
  const cost1 = costFn(index, from, from + 1)
  if (!canAfford(cost1)) {
    return {
      ok: true as const,
      fromLevel: from,
      toLevel: from,
      levels: 0,
      cost: 0,
      affordable: false,
    }
  }

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const cost = costFn(index, from, mid)
    if (cost <= money) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  const to = clamp(best, from, MAX_LEVEL)
  const levels = to - from
  const cost = costFn(index, from, to)

  return {
    ok: true as const,
    fromLevel: from,
    toLevel: to,
    levels,
    cost,
    affordable: levels > 0 && canAfford(cost),
  }
}

function makeTrack(index: number, name: string): Track {
  const base: Track = {
    id: `track_${index + 1}`,
    index,
    name: name.trim().length ? name.trim() : `Track ${index + 1}`,

    rating: 1.0,
    maxRating: 5.0,

    capacityLevel: 1,
    capacity: 0,
    maxCapacity: 0,

    safetyLevel: 1,
    safety: 0,
    maxSafety: 0,

    entertainmentLevel: 1,
    entertainment: 0,
    maxEntertainment: 0,
    trackSize: (index + 1) * 5,
  }

  return recomputeTrack(base)
}

function recomputeTrack(t: Track): Track {
  const capacityLevel = clamp(t.capacityLevel ?? 1, MIN_LEVEL, MAX_LEVEL)
  const safetyLevel = clamp(t.safetyLevel ?? 1, MIN_LEVEL, MAX_LEVEL)
  const entertainmentLevel = clamp(t.entertainmentLevel ?? 1, MIN_LEVEL, MAX_LEVEL)

  const maxCapacity = capacityMaxForIndex(t.index)
  const maxSafety = safetyMaxForIndex(t.index)
  const maxEntertainment = entertainmentMaxForIndex(t.index)

  const next: Track = {
    ...t,

    maxRating: 5.0,

    capacityLevel,
    safetyLevel,
    entertainmentLevel,

    maxCapacity,
    maxSafety,
    maxEntertainment,

    capacity: capacityFor(t.index, capacityLevel),
    safety: safetyFor(t.index, safetyLevel),
    entertainment: entertainmentFor(t.index, entertainmentLevel),

    rating: 1.0,
  }

  return {
    ...next,
    rating: computeRatingPrecise(next),
  }
}

const STORAGE_KEY = 'idle.tracks.v4'

let useTracks: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = {
    tracks: [] as Track[],
  }
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        const rawTracks = Array.isArray(parsed.state?.tracks) ? parsed.state.tracks : []
        state.tracks = rawTracks.map((t: any, idx: number) => {
          const index = typeof t.index === 'number' ? t.index : idx
          const name = typeof t.name === 'string' ? t.name : `Track ${index + 1}`
          const legacyLevel = typeof t.level === 'number' ? t.level : 1
          const capacityLevel = typeof t.capacityLevel === 'number' ? t.capacityLevel : legacyLevel
          const safetyLevel = typeof t.safetyLevel === 'number' ? t.safetyLevel : legacyLevel
          const entertainmentLevel =
            typeof t.entertainmentLevel === 'number' ? t.entertainmentLevel : 1

          const base: Track = {
            id: typeof t.id === 'string' ? t.id : `track_${index + 1}`,
            index,
            name,
            rating: 1.0,
            maxRating: 5.0,
            capacityLevel,
            capacity: 0,
            maxCapacity: 0,
            safetyLevel,
            safety: 0,
            maxSafety: 0,
            entertainmentLevel,
            entertainment: 0,
            maxEntertainment: 0,
            trackSize: (index + 1) * 10,
          }
          return recomputeTrack(base)
        })
      }
    } catch (e) {
      console.error('Failed to load tracks state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 4 }))
    } catch (e) {
      console.error('Failed to save tracks state', e)
    }
  }

  const notify = () => {
    saveToStorage()
    listeners.forEach((fn) => fn())
  }

  loadFromStorage()

  const actions: TracksState = {
    tracks: state.tracks,

    nextTrackCost: () => trackCostForIndex(state.tracks.length),

    canBuyNextTrack: () => useMoney.getState().canAfford(trackCostForIndex(state.tracks.length)),

    buyNextTrack: (name: string) => {
      const cost = trackCostForIndex(state.tracks.length)
      const ok = useMoney.getState().spend(cost)
      if (!ok) return { ok: false as const, reason: 'not_enough_money' as const }

      const index = state.tracks.length
      const track = makeTrack(index, name)

      state.tracks = [...state.tracks, track]
      notify()
      return { ok: true as const, track, cost }
    },

    quoteCapacityUpgrade: (trackId: string, mode: UpgradeMode) => {
      const t = state.tracks.find((x) => x.id === trackId)
      if (!t) return { ok: false as const, reason: 'not_found' as const }
      return quoteUpgrade(t.index, t.capacityLevel, mode, capacityLevelCost)
    },

    quoteSafetyUpgrade: (trackId: string, mode: UpgradeMode) => {
      const t = state.tracks.find((x) => x.id === trackId)
      if (!t) return { ok: false as const, reason: 'not_found' as const }
      return quoteUpgrade(t.index, t.safetyLevel, mode, safetyLevelCost)
    },

    quoteEntertainmentUpgrade: (trackId: string, mode: UpgradeMode) => {
      const t = state.tracks.find((x) => x.id === trackId)
      if (!t) return { ok: false as const, reason: 'not_found' as const }
      return quoteUpgrade(t.index, t.entertainmentLevel, mode, entertainmentLevelCost)
    },

    upgradeCapacityByMode: (trackId: string, mode: UpgradeMode) => {
      const cur = state.tracks
      const i = cur.findIndex((t) => t.id === trackId)
      if (i === -1) return { ok: false as const, reason: 'not_found' as const }

      const t = cur[i]
      const q = quoteUpgrade(t.index, t.capacityLevel, mode, capacityLevelCost)
      if (!q.ok) return { ok: false as const, reason: 'already_max' as const }

      const ok = useMoney.getState().spend(q.cost)
      if (!ok) return { ok: false as const, reason: 'not_enough_money' as const }

      const updated = [...cur]
      updated[i] = recomputeTrack({ ...t, capacityLevel: q.toLevel })
      state.tracks = updated
      notify()
      return { ok: true as const, cost: q.cost, newLevel: q.toLevel }
    },

    upgradeSafetyByMode: (trackId: string, mode: UpgradeMode) => {
      const cur = state.tracks
      const i = cur.findIndex((t) => t.id === trackId)
      if (i === -1) return { ok: false as const, reason: 'not_found' as const }

      const t = cur[i]
      const q = quoteUpgrade(t.index, t.safetyLevel, mode, safetyLevelCost)
      if (!q.ok) return { ok: false as const, reason: 'already_max' as const }

      const ok = useMoney.getState().spend(q.cost)
      if (!ok) return { ok: false as const, reason: 'not_enough_money' as const }

      const updated = [...cur]
      updated[i] = recomputeTrack({ ...t, safetyLevel: q.toLevel })
      state.tracks = updated
      notify()
      return { ok: true as const, cost: q.cost, newLevel: q.toLevel }
    },

    upgradeEntertainmentByMode: (trackId: string, mode: UpgradeMode) => {
      const cur = state.tracks
      const i = cur.findIndex((t) => t.id === trackId)
      if (i === -1) return { ok: false as const, reason: 'not_found' as const }

      const t = cur[i]
      const q = quoteUpgrade(t.index, t.entertainmentLevel, mode, entertainmentLevelCost)
      if (!q.ok) return { ok: false as const, reason: 'already_max' as const }

      const ok = useMoney.getState().spend(q.cost)
      if (!ok) return { ok: false as const, reason: 'not_enough_money' as const }

      const updated = [...cur]
      updated[i] = recomputeTrack({ ...t, entertainmentLevel: q.toLevel })
      state.tracks = updated
      notify()
      return { ok: true as const, cost: q.cost, newLevel: q.toLevel }
    },

    getById: (trackId: string) => state.tracks.find((t) => t.id === trackId),

    reset: () => {
      state.tracks = []
      notify()
    },
  }

  const useTracksWeb: any = (selector?: (state: TracksState) => any) => {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])
    const fullState = { ...actions, tracks: state.tracks }
    return selector ? selector(fullState) : fullState
  }

  useTracksWeb.getState = () => ({ ...actions, tracks: state.tracks })
  useTracksWeb.setState = (partial: Partial<typeof state>) => {
    Object.assign(state, partial)
    notify()
  }

  useTracks = useTracksWeb
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { persist, createJSONStorage } = require('zustand/middleware') as any

  useTracks = create()(
    persist(
      (set: any, get: any) => ({
        tracks: [],

        nextTrackCost: () => trackCostForIndex(get().tracks.length),

        canBuyNextTrack: () => useMoney.getState().canAfford(get().nextTrackCost()),

        buyNextTrack: (name: string) => {
          const cost = get().nextTrackCost()
          const ok = useMoney.getState().spend(cost)
          if (!ok) return { ok: false as const, reason: 'not_enough_money' }

          const index = get().tracks.length
          const track = makeTrack(index, name)

          set((s: any) => ({ tracks: [...s.tracks, track] }))
          return { ok: true as const, track, cost }
        },
        quoteCapacityUpgrade: (trackId: string, mode: UpgradeMode) => {
          const t = get().tracks.find((x: Track) => x.id === trackId)
          if (!t) return { ok: false as const, reason: 'not_found' }
          return quoteUpgrade(t.index, t.capacityLevel, mode, capacityLevelCost)
        },

        quoteSafetyUpgrade: (trackId: string, mode: UpgradeMode) => {
          const t = get().tracks.find((x: Track) => x.id === trackId)
          if (!t) return { ok: false as const, reason: 'not_found' }
          return quoteUpgrade(t.index, t.safetyLevel, mode, safetyLevelCost)
        },

        quoteEntertainmentUpgrade: (trackId: string, mode: UpgradeMode) => {
          const t = get().tracks.find((x: Track) => x.id === trackId)
          if (!t) return { ok: false as const, reason: 'not_found' }
          return quoteUpgrade(t.index, t.entertainmentLevel, mode, entertainmentLevelCost)
        },
        upgradeCapacityByMode: (trackId: string, mode: UpgradeMode) => {
          const cur = get().tracks
          const i = cur.findIndex((t: Track) => t.id === trackId)
          if (i === -1) return { ok: false as const, reason: 'not_found' }

          const t = cur[i]
          const q = quoteUpgrade(t.index, t.capacityLevel, mode, capacityLevelCost)
          if (!q.ok) return { ok: false as const, reason: 'already_max' }

          const ok = useMoney.getState().spend(q.cost)
          if (!ok) return { ok: false as const, reason: 'not_enough_money' }

          const updated = [...cur]
          updated[i] = recomputeTrack({ ...t, capacityLevel: q.toLevel })
          set({ tracks: updated })
          return { ok: true as const, cost: q.cost, newLevel: q.toLevel }
        },

        upgradeSafetyByMode: (trackId: string, mode: UpgradeMode) => {
          const cur = get().tracks
          const i = cur.findIndex((t: Track) => t.id === trackId)
          if (i === -1) return { ok: false as const, reason: 'not_found' }

          const t = cur[i]
          const q = quoteUpgrade(t.index, t.safetyLevel, mode, safetyLevelCost)
          if (!q.ok) return { ok: false as const, reason: 'already_max' }

          const ok = useMoney.getState().spend(q.cost)
          if (!ok) return { ok: false as const, reason: 'not_enough_money' }

          const updated = [...cur]
          updated[i] = recomputeTrack({ ...t, safetyLevel: q.toLevel })
          set({ tracks: updated })
          return { ok: true as const, cost: q.cost, newLevel: q.toLevel }
        },

        upgradeEntertainmentByMode: (trackId: string, mode: UpgradeMode) => {
          const cur = get().tracks
          const i = cur.findIndex((t: Track) => t.id === trackId)
          if (i === -1) return { ok: false as const, reason: 'not_found' }

          const t = cur[i]
          const q = quoteUpgrade(t.index, t.entertainmentLevel, mode, entertainmentLevelCost)
          if (!q.ok) return { ok: false as const, reason: 'already_max' }

          const ok = useMoney.getState().spend(q.cost)
          if (!ok) return { ok: false as const, reason: 'not_enough_money' }

          const updated = [...cur]
          updated[i] = recomputeTrack({ ...t, entertainmentLevel: q.toLevel })
          set({ tracks: updated })
          return { ok: true as const, cost: q.cost, newLevel: q.toLevel }
        },
        getById: (trackId: string) => get().tracks.find((t: Track) => t.id === trackId),

        reset: () => set({ tracks: [] }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        version: 4,

        migrate: (persisted: any) => {
          const rawTracks = Array.isArray(persisted?.tracks) ? persisted.tracks : []
          const migrated = rawTracks.map((t: any, idx: number) => {
            const index = typeof t.index === 'number' ? t.index : idx
            const name = typeof t.name === 'string' ? t.name : `Track ${index + 1}`

            const legacyLevel = typeof t.level === 'number' ? t.level : 1

            const capacityLevel =
              typeof t.capacityLevel === 'number' ? t.capacityLevel : legacyLevel
            const safetyLevel = typeof t.safetyLevel === 'number' ? t.safetyLevel : legacyLevel
            const entertainmentLevel =
              typeof t.entertainmentLevel === 'number' ? t.entertainmentLevel : 1

            const base: Track = {
              id: typeof t.id === 'string' ? t.id : `track_${index + 1}`,
              index,
              name,

              rating: 1.0,
              maxRating: 5.0,

              capacityLevel,
              capacity: 0,
              maxCapacity: 0,

              safetyLevel,
              safety: 0,
              maxSafety: 0,

              entertainmentLevel,
              entertainment: 0,
              maxEntertainment: 0,
              trackSize: (index + 1) * 10,
            }

            return recomputeTrack(base)
          })

          return { ...persisted, tracks: migrated }
        },
      },
    ),
  )
}

export { useTracks }
