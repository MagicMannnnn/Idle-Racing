import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type CellType = 'empty' | 'track' | 'infield' | 'stand'

export type TrackGrid = {
  size: number
  cells: CellType[]
  updatedAt: number
}

export type TrackMapState = {
  byTrackId: Record<string, TrackGrid | undefined>

  get: (trackId: string) => TrackGrid | undefined

  ensure: (trackId: string, size?: number) => void
  setSize: (trackId: string, size: number) => void

  setCell: (trackId: string, x: number, y: number, type: CellType) => void
  setCells: (trackId: string, cells: CellType[]) => void

  clear: (trackId: string) => void

  resetAll: () => void
}

export function generateDefaultOval(size: number): TrackGrid {
  const cells: CellType[] = new Array(size * size).fill('infield')

  const idxAt = (x: number, y: number) => y * size + x

  // 1) Stands ring: entire outer border = empty
  for (let x = 0; x < size; x++) {
    cells[idxAt(x, 0)] = 'empty'
    cells[idxAt(x, size - 1)] = 'empty'
  }
  for (let y = 0; y < size; y++) {
    cells[idxAt(0, y)] = 'empty'
    cells[idxAt(size - 1, y)] = 'empty'
  }

  if (size === 5 || size === 7) {
    const inset = 1

    for (let x = inset; x <= size - 1 - inset; x++) {
      // top of inner ring
      cells[idxAt(x, inset)] = 'track'
      // bottom of inner ring
      cells[idxAt(x, size - 1 - inset)] = 'track'
    }

    for (let y = inset; y <= size - 1 - inset; y++) {
      // left of inner ring
      cells[idxAt(inset, y)] = 'track'
      // right of inner ring
      cells[idxAt(size - 1 - inset, y)] = 'track'
    }
  }

  // 2) Define an inner box where track is allowed (never touching border)
  // Border = 0..size-1 reserved for stands. Track stays at least 1 cell away => start at 2.
  const left = 2
  const top = 2
  const right = size - 3
  const bottom = size - 3

  const w = right - left
  const h = bottom - top
  if (w < 3 || h < 3) {
    return { size, cells, updatedAt: Date.now() }
  }

  // 3) Corner "radius" as a staircase length.
  // Must satisfy: 2r <= min(w, h)
  const maxR = Math.max(1, Math.floor(Math.min(w, h) / 2) - 1)
  const r = Math.max(1, Math.min(maxR, Math.floor((size - 6) / 3))) // tweakable "roundness"

  // 4) Build an ordered closed loop (every step is orthogonal)
  const path: Array<{ x: number; y: number }> = []

  const push = (x: number, y: number) => {
    const last = path[path.length - 1]
    if (!last || last.x !== x || last.y !== y) path.push({ x, y })
  }

  // Start on top edge, after left corner radius
  let x = left + r
  let y = top
  push(x, y)

  // Top edge: move E to before right corner radius
  while (x < right - r) {
    x += 1
    push(x, y)
  }

  // Top-right corner: staircase E+S repeated r times
  for (let i = 0; i < r; i++) {
    x += 1
    push(x, y)
    y += 1
    push(x, y)
  }

  // Right edge: move S to before bottom corner radius
  while (y < bottom - r) {
    y += 1
    push(x, y)
  }

  // Bottom-right corner: staircase S+W repeated r times
  for (let i = 0; i < r; i++) {
    y += 1
    push(x, y)
    x -= 1
    push(x, y)
  }

  // Bottom edge: move W to after left corner radius
  while (x > left + r) {
    x -= 1
    push(x, y)
  }

  // Bottom-left corner: staircase W+N repeated r times
  for (let i = 0; i < r; i++) {
    x -= 1
    push(x, y)
    y -= 1
    push(x, y)
  }

  // Left edge: move N to after top corner radius
  while (y > top + r) {
    y -= 1
    push(x, y)
  }

  // Top-left corner: staircase N+E repeated r times (returns to start)
  for (let i = 0; i < r; i++) {
    y -= 1
    push(x, y)
    x += 1
    push(x, y)
  }

  // At this point we should be back at (left+r, top). Close explicitly if needed.
  const start = path[0]
  const end = path[path.length - 1]
  if (end.x !== start.x || end.y !== start.y) {
    // Shouldn't happen, but keep safe.
    push(start.x, start.y)
  }

  // Remove duplicated final point (keep the loop set clean)
  if (path.length > 1) {
    const last = path[path.length - 1]
    if (last.x === start.x && last.y === start.y) path.pop()
  }

  // 5) Paint track
  const trackSet = new Set<number>()
  for (const p of path) trackSet.add(idxAt(p.x, p.y))
  for (const id of trackSet) cells[id] = 'track'

  // 6) Hard validation: every track tile must have exactly 2 orthogonal neighbours
  // If something weird happens (shouldn't), fall back to no track (but you can log).
  const orth = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const

  const countNeighbors = (id: number) => {
    const cx2 = id % size
    const cy2 = Math.floor(id / size)
    let n = 0
    for (const [dx, dy] of orth) {
      const nx = cx2 + dx
      const ny = cy2 + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue
      if (trackSet.has(idxAt(nx, ny))) n++
    }
    return n
  }

  for (const id of trackSet) {
    if (countNeighbors(id) !== 2) {
      // Extremely unlikely with this construction; but keep correctness strict.
      for (const tid of trackSet) cells[tid] = 'infield'
      return { size, cells, updatedAt: Date.now() }
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
        if (type === 'stand' && next[idx] !== 'empty') return

        next[idx] = type

        set((s) => ({
          byTrackId: {
            ...s.byTrackId,
            [trackId]: { ...grid, cells: next, updatedAt: Date.now() },
          },
        }))
      },

      setCells: (trackId, cells) => {
        const grid = get().byTrackId[trackId]
        if (!grid) return
        if (cells.length !== grid.size * grid.size) return
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
