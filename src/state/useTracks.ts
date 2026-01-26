// src/state/useTracks.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useMoney } from './useMoney'

const MIN_LEVEL = 1
const MAX_LEVEL = 100

export type UpgradeMode = 'x1' | 'x10' | 'max'

export type Track = {
  id: string
  index: number
  name: string

  // Derived (NOT directly upgradable)
  rating: number
  maxRating: number

  // CAPACITY
  capacityLevel: number // 1..100
  capacity: number
  maxCapacity: number

  // SAFETY
  safetyLevel: number // 1..100
  safety: number
  maxSafety: number

  // ENTERTAINMENT (%)
  entertainmentLevel: number // 1..100
  entertainment: number // 0..100
  maxEntertainment: number // 0..100
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

  // economy
  nextTrackCost: () => number
  canBuyNextTrack: () => boolean
  buyNextTrack: (
    name: string,
  ) => { ok: true; track: Track; cost: number } | { ok: false; reason: 'not_enough_money' }

  // quotes
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

  // upgrades by mode
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

  // utils
  getById: (trackId: string) => Track | undefined
  reset: () => void
}

// =====================================================
// TUNING (easy to tweak)
// =====================================================

/** Track purchase costs: 100, 10,000, 1,000,000... */
function trackCostForIndex(index: number) {
  return Math.round(100 * Math.pow(100, index))
}

/** Tier multiplier so later tracks are pricier */
function tierMult(index: number) {
  // tweak to make later tracks scale harder/softer
  return 1 + index * 0.75
}

// ------- Stat ranges by index (tweak these) -------

function capacityBaseForIndex(index: number) {
  return 10 + index * 10
}
function capacityMaxForIndex(index: number) {
  return 250 + index * 250
}

function safetyBaseForIndex(index: number) {
  return 1.0 + index * 0.05
}
function safetyMaxForIndex(index: number) {
  return 2.0 + index * 0.15
}

function entertainmentBaseForIndex(index: number) {
  return 5 + index * 2 // %
}
function entertainmentMaxForIndex(index: number) {
  return 60 + index * 5 // %
}

// ------- Non-linear per-level cost functions (3 functions, tweak these) -------

function capacityLevelCost(index: number, fromLevel: number, toLevel: number) {
  // Quadratic-ish
  const mult = tierMult(index)
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 30 + Math.pow(lvl, 1.55) * 6 * mult
  }
  return Math.round(total)
}

function safetyLevelCost(index: number, fromLevel: number, toLevel: number) {
  // Medium curve
  const mult = tierMult(index)
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 45 + Math.pow(lvl, 1.35) * 7 * mult
  }
  return Math.round(total)
}

function entertainmentLevelCost(index: number, fromLevel: number, toLevel: number) {
  // Steeper late
  const mult = tierMult(index)
  let total = 0
  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    total += 40 + (Math.pow(lvl, 1.25) * 8 + Math.pow(lvl / 12, 3) * 120) * mult
  }
  return Math.round(total)
}

// ------- Rating cap + derived rating (tweak) -------

function trackMaxStars(index: number) {
  // Track 1: 3.6 max, Track 2: 4.2, Track 3: 4.8, Track 4+: 5.0
  return Math.min(5, 3.6 + index * 0.6)
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

// =====================================================
// DERIVED VALUES
// =====================================================

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function lerpByLevel(level: number, base: number, max: number) {
  const t = (clamp(level, MIN_LEVEL, MAX_LEVEL) - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL) // 0..1
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
  return Math.round(lerpByLevel(level, base, max) * 100) / 100 // 2dp
}

function entertainmentFor(index: number, level: number) {
  const base = entertainmentBaseForIndex(index)
  const max = entertainmentMaxForIndex(index)
  return Math.round(lerpByLevel(level, base, max)) // whole %
}

function computeRatingPrecise(t: Track) {
  const capN = clamp01(t.capacity / t.maxCapacity)
  const safN = clamp01(t.safety / t.maxSafety)
  const entN = clamp01(t.entertainment / t.maxEntertainment)

  // weights (tweak)
  const score = capN * 0.45 + safN * 0.3 + entN * 0.25 // 0..1

  const maxStars = trackMaxStars(t.index)
  const minStars = 1.0
  const raw = minStars + (maxStars - minStars) * score

  return Math.round(raw * 100) / 100 // 2dp
}

// =====================================================
// UPGRADE QUOTES
// =====================================================

function modeToLevels(current: number, mode: UpgradeMode) {
  if (mode === 'x1') return 1
  if (mode === 'x10') return 10
  return MAX_LEVEL - current
}

function quoteUpgrade(
  index: number,
  from: number,
  mode: UpgradeMode,
  costFn: (i: number, a: number, b: number) => number,
): UpgradeQuote {
  if (from >= MAX_LEVEL) return { ok: false as const, reason: 'already_max' }

  const to = clamp(from + modeToLevels(from, mode), MIN_LEVEL, MAX_LEVEL)
  const levels = to - from
  const cost = costFn(index, from, to)
  const affordable = useMoney.getState().canAfford(cost)

  return { ok: true as const, fromLevel: from, toLevel: to, levels, cost, affordable }
}

// =====================================================
// TRACK CREATION / RECOMPUTE
// =====================================================

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

    rating: 1.0, // overwritten below
  }

  return {
    ...next,
    rating: computeRatingPrecise(next),
  }
}

// =====================================================
// STORE
// =====================================================

export const useTracks = create<TracksState>()(
  persist(
    (set, get) => ({
      tracks: [],

      nextTrackCost: () => trackCostForIndex(get().tracks.length),

      canBuyNextTrack: () => useMoney.getState().canAfford(get().nextTrackCost()),

      buyNextTrack: (name: string) => {
        const cost = get().nextTrackCost()
        const ok = useMoney.getState().spend(cost)
        if (!ok) return { ok: false as const, reason: 'not_enough_money' }

        const index = get().tracks.length
        const track = makeTrack(index, name)

        set((s) => ({ tracks: [...s.tracks, track] }))
        return { ok: true as const, track, cost }
      },

      // Quotes
      quoteCapacityUpgrade: (trackId, mode) => {
        const t = get().tracks.find((x) => x.id === trackId)
        if (!t) return { ok: false as const, reason: 'not_found' }
        return quoteUpgrade(t.index, t.capacityLevel, mode, capacityLevelCost)
      },

      quoteSafetyUpgrade: (trackId, mode) => {
        const t = get().tracks.find((x) => x.id === trackId)
        if (!t) return { ok: false as const, reason: 'not_found' }
        return quoteUpgrade(t.index, t.safetyLevel, mode, safetyLevelCost)
      },

      quoteEntertainmentUpgrade: (trackId, mode) => {
        const t = get().tracks.find((x) => x.id === trackId)
        if (!t) return { ok: false as const, reason: 'not_found' }
        return quoteUpgrade(t.index, t.entertainmentLevel, mode, entertainmentLevelCost)
      },

      // Upgrades by mode
      upgradeCapacityByMode: (trackId, mode) => {
        const cur = get().tracks
        const i = cur.findIndex((t) => t.id === trackId)
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

      upgradeSafetyByMode: (trackId, mode) => {
        const cur = get().tracks
        const i = cur.findIndex((t) => t.id === trackId)
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

      upgradeEntertainmentByMode: (trackId, mode) => {
        const cur = get().tracks
        const i = cur.findIndex((t) => t.id === trackId)
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

      // utils
      getById: (trackId) => get().tracks.find((t) => t.id === trackId),

      reset: () => set({ tracks: [] }),
    }),
    {
      name: 'idle.tracks.v4',
      storage: createJSONStorage(() => AsyncStorage),
      version: 4,

      migrate: (persisted: any) => {
        const rawTracks = Array.isArray(persisted?.tracks) ? persisted.tracks : []
        const migrated = rawTracks.map((t: any, idx: number) => {
          const index = typeof t.index === 'number' ? t.index : idx
          const name = typeof t.name === 'string' ? t.name : `Track ${index + 1}`

          // v1/v2 may have no per-stat levels; v2 may have a single "level"
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
          }

          return recomputeTrack(base)
        })

        return { ...persisted, tracks: migrated }
      },
    },
  ),
)
