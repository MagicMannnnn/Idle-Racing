import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type CellType = 'empty' | 'track' | 'infield' | 'stand'

export type TrackGrid = {
  size: number // NxN
  // row-major: index = y * size + x
  cells: CellType[]
  updatedAt: number
}

export type TrackMapState = {
  byTrackId: Record<string, TrackGrid | undefined>

  // selectors / getters
  get: (trackId: string) => TrackGrid | undefined

  // init / sizing
  ensure: (trackId: string, size?: number) => void
  setSize: (trackId: string, size: number) => void // regenerates default oval

  // editing helpers
  setCell: (trackId: string, x: number, y: number, type: CellType) => void

  // NEW: commit full grid at once (editor save)
  setCells: (trackId: string, cells: CellType[]) => void

  clear: (trackId: string) => void // regenerates default oval

  resetAll: () => void
}

/**
 * Generates a simple oval "ring" track:
 * - outside: empty
 * - ring: track
 * - inside: infield
 *
 * Stand placement is NOT auto-done here.
 * Stands should only ever be placed on 'empty' cells (free spaces).
 */
export function generateDefaultOval(size: number): TrackGrid {
  const cells: CellType[] = new Array(size * size).fill('empty')

  const cx = (size - 1) / 2
  const cy = (size - 1) / 2

  const innerR = size * 0.1
  const outerR = size * 0.3

  const sx = 1.15
  const sy = 0.95

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / sx
      const dy = (y - cy) / sy
      const d = Math.sqrt(dx * dx + dy * dy)

      const idx = y * size + x

      if (d <= innerR) cells[idx] = 'infield'
      else if (d <= outerR) cells[idx] = 'track'
      else cells[idx] = 'empty'
    }
  }

  return { size, cells, updatedAt: Date.now() }
}

function inBounds(size: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < size && y < size
}

export const useTrackMaps = create<TrackMapState>()(
  persist(
    (set, get) => ({
      byTrackId: {},

      get: (trackId) => get().byTrackId[trackId],

      ensure: (trackId, size = 5) => {
        const existing = get().byTrackId[trackId]
        if (existing) return
        set((s) => ({
          byTrackId: { ...s.byTrackId, [trackId]: generateDefaultOval(size) },
        }))
      },

      setSize: (trackId, size) => {
        let nextSize = size
        if (nextSize < 3) nextSize = 3
        if (nextSize % 2 === 0) nextSize += 1
        set((s) => ({
          byTrackId: { ...s.byTrackId, [trackId]: generateDefaultOval(nextSize) },
        }))
      },

      setCell: (trackId, x, y, type) => {
        const grid = get().byTrackId[trackId]
        if (!grid) return
        if (!inBounds(grid.size, x, y)) return

        const idx = y * grid.size + x
        const next = grid.cells.slice()

        // keep your existing invariant for single-cell edits
        if (type === 'stand' && next[idx] !== 'empty') return

        next[idx] = type

        set((s) => ({
          byTrackId: {
            ...s.byTrackId,
            [trackId]: { ...grid, cells: next, updatedAt: Date.now() },
          },
        }))
      },

      // ✅ NEW: commit full grid exactly as provided (no “corrections” based on old grid)
      setCells: (trackId, cells) => {
        const grid = get().byTrackId[trackId]
        if (!grid) return
        if (cells.length !== grid.size * grid.size) return

        // Optional: ensure stand only appears on empty IN THE PROVIDED CELLS.
        // (Viewer expects stands only live on empty.)
        const next = cells.slice()
        for (let i = 0; i < next.length; i++) {
          if (next[i] === 'stand') next[i] = 'empty'
        }

        set((s) => ({
          byTrackId: {
            ...s.byTrackId,
            [trackId]: { ...grid, cells: next, updatedAt: Date.now() },
          },
        }))
      },

      clear: (trackId) => {
        const grid = get().byTrackId[trackId]
        if (!grid) return
        set((s) => ({
          byTrackId: { ...s.byTrackId, [trackId]: generateDefaultOval(grid.size) },
        }))
      },

      resetAll: () => set({ byTrackId: {} }),
    }),
    {
      name: 'idle.trackmaps.v13',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
