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

  // editing helpers (for later)
  setCell: (trackId: string, x: number, y: number, type: CellType) => void
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

  // This is the important part:
  // For size=5 => innerR=0.5, outerR=1.5 => "middle 3x3 without center"
  const innerR = size * 0.1
  const outerR = size * 0.3

  // Slight oval scaling (wider than tall)
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
        if (size < 3) size = 3
        if (size % 2 === 0) size += 1 // odd sizes look nicer (5,7,9...)
        set((s) => ({
          byTrackId: { ...s.byTrackId, [trackId]: generateDefaultOval(size) },
        }))
      },

      setCell: (trackId, x, y, type) => {
        const grid = get().byTrackId[trackId]
        if (!grid) return
        if (!inBounds(grid.size, x, y)) return

        const idx = y * grid.size + x
        const next = grid.cells.slice()

        // simple guard: stands should only be placed on empty cells (for later)
        if (type === 'stand' && next[idx] !== 'empty') return
        next[idx] = type

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
