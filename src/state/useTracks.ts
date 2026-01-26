import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useMoney } from './useMoney'

export type Track = {
  id: string
  name: string
  rating: number
  maxRating: number
  capacity: number
}

type TracksState = {
  tracks: Track[]

  // economy
  nextTrackCost: () => number
  canBuyNextTrack: () => boolean
  buyNextTrack: () =>
    | { ok: true; track: Track; cost: number }
    | { ok: false; reason: 'not_enough_money' }

  // upgrades
  upgradeCapacity: (
    trackId: string,
    delta?: number,
  ) => { ok: true } | { ok: false; reason: 'not_found' }
  upgradeRating: (
    trackId: string,
    delta?: number,
  ) => { ok: true } | { ok: false; reason: 'not_found' | 'already_max' }

  // utils
  getById: (trackId: string) => Track | undefined
  reset: () => void
}

/**
 * Cost ladder:
 * first track = 100, second = 10,000, third = 1,000,000 ...
 * i.e. 100 * (100 ** index)
 *
 * You can replace this with any formula you like.
 */
function costForIndex(index: number) {
  return Math.round(100 * Math.pow(100, index))
}

function makeTrack(index: number): Track {
  const id = `track_${index + 1}`
  return {
    id,
    name: `Track ${index + 1}`,
    rating: 1.0,
    maxRating: 5.0,
    capacity: 10,
  }
}

export const useTracks = create<TracksState>()(
  persist(
    (set, get) => ({
      tracks: [],

      nextTrackCost: () => costForIndex(get().tracks.length),

      canBuyNextTrack: () => {
        const cost = get().nextTrackCost()
        return useMoney.getState().canAfford(cost)
      },

      buyNextTrack: () => {
        const cost = get().nextTrackCost()
        const ok = useMoney.getState().spend(cost)
        if (!ok) return { ok: false as const, reason: 'not_enough_money' }

        const index = get().tracks.length
        const track = makeTrack(index)

        set((s) => ({ tracks: [...s.tracks, track] }))
        return { ok: true as const, track, cost }
      },

      upgradeCapacity: (trackId, delta = 5) => {
        const cur = get().tracks
        const i = cur.findIndex((t) => t.id === trackId)
        if (i === -1) return { ok: false as const, reason: 'not_found' }

        const updated = [...cur]
        updated[i] = { ...updated[i], capacity: updated[i].capacity + delta }
        set({ tracks: updated })
        return { ok: true as const }
      },

      upgradeRating: (trackId, delta = 0.1) => {
        const cur = get().tracks
        const i = cur.findIndex((t) => t.id === trackId)
        if (i === -1) return { ok: false as const, reason: 'not_found' }

        const t = cur[i]
        if (t.rating >= t.maxRating) return { ok: false as const, reason: 'already_max' }

        const next = Math.min(t.maxRating, Math.round((t.rating + delta) * 10) / 10)

        const updated = [...cur]
        updated[i] = { ...t, rating: next }
        set({ tracks: updated })
        return { ok: true as const }
      },

      getById: (trackId) => get().tracks.find((t) => t.id === trackId),

      reset: () => set({ tracks: [] }),
    }),
    {
      name: 'idle.tracks.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
