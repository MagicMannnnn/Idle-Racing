import React, { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTrackMaps } from '@/src/state/useTrackMaps'

type Props = {
  trackId: string
  // render size in px
  sizePx?: number
  // initial grid size for new tracks (5,7,9...)
  initialGridSize?: number

  // used to decide how many stands to visually show
  capacity: number
  maxCapacity: number
}

const GRID_GAP = 1
const GRID_PAD = 1

// ---- Deterministic hashing helpers (fast + stable) ----
function fnv1a32(str: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mix32(x: number) {
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

function layoutHash(cells: string[]) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    for (let j = 0; j < c.length; j++) {
      h ^= c.charCodeAt(j)
      h = Math.imul(h, 16777619)
    }
    h ^= 1249
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function toXY(i: number, size: number) {
  return { x: i % size, y: Math.floor(i / size) }
}

function sign(n: number) {
  return n === 0 ? 0 : n > 0 ? 1 : -1
}

function angleFromDelta(dx: number, dy: number) {
  // rotate 90deg anticlockwise: (dx, dy) -> (-dy, dx)
  const rx = dy
  const ry = -dx

  // 8-way rotation
  if (rx === 1 && ry === 0) return '0deg' // E
  if (rx === 1 && ry === 1) return '45deg' // SE
  if (rx === 0 && ry === 1) return '90deg' // S
  if (rx === -1 && ry === 1) return '135deg' // SW
  if (rx === -1 && ry === 0) return '180deg' // W
  if (rx === -1 && ry === -1) return '-135deg' // NW
  if (rx === 0 && ry === -1) return '-90deg' // N
  if (rx === 1 && ry === -1) return '-45deg' // NE
  return '0deg'
}

export function TrackMapView({
  trackId,
  sizePx = 280,
  initialGridSize = 5,
  capacity,
  maxCapacity,
}: Props) {
  const ensure = useTrackMaps((s) => s.ensure)
  const grid = useTrackMaps((s) => s.get(trackId))

  useEffect(() => {
    ensure(trackId, initialGridSize)
  }, [ensure, trackId, initialGridSize])

  const mapSize = grid?.size ?? initialGridSize
  const cells = grid?.cells ?? []

  const cellPx = useMemo(() => {
    const inner = sizePx - GRID_PAD * 2 - GRID_GAP * (mapSize - 1)
    return Math.max(6, Math.floor(inner / mapSize))
  }, [sizePx, mapSize])

  const wrapW = cellPx * mapSize + GRID_GAP * (mapSize - 1) + GRID_PAD * 2

  const standSet = useMemo(() => {
    if (!cells.length) return new Set<number>()

    const emptyIdx: number[] = []
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 'empty') emptyIdx.push(i)
    }
    if (emptyIdx.length === 0) return new Set<number>()

    const fill = maxCapacity > 0 ? Math.max(0, Math.min(1, capacity / maxCapacity)) : 0
    const k = Math.floor(emptyIdx.length * fill)

    if (k <= 0) return new Set<number>()
    if (k >= emptyIdx.length) return new Set<number>(emptyIdx)

    // IMPORTANT: seed must NOT depend on capacity, so the ranking is stable.
    const seedA = fnv1a32(trackId)
    const seedB = layoutHash(cells)
    const seedC = mix32(mapSize) // or include maxCapacity if you want, but NOT current capacity
    const seed = mix32(seedA ^ seedB ^ seedC)

    // deterministic rank per cell (stable across capacity changes)
    const scored = emptyIdx.map((idx) => ({
      idx,
      score: mix32(seed ^ idx) / 0xffffffff,
    }))
    scored.sort((a, b) => a.score - b.score)

    const set = new Set<number>()
    for (let i = 0; i < k; i++) set.add(scored[i].idx)
    return set
  }, [cells, trackId, capacity, maxCapacity, mapSize])

  // ---- For each stand cell, face toward the nearest track (8-way, includes diagonals) ----
  const standFacingByIndex = useMemo(() => {
    const map = new Map<number, string>()
    if (!cells.length || standSet.size === 0) return map

    const tracks: Array<{ x: number; y: number }> = []
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 'track') tracks.push(toXY(i, mapSize))
    }
    if (tracks.length === 0) return map

    for (const idx of standSet) {
      const s = toXY(idx, mapSize)

      let bestD2 = Number.POSITIVE_INFINITY
      let bestDx = 0
      let bestDy = 0

      for (const t of tracks) {
        const dx = t.x - s.x
        const dy = t.y - s.y
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) {
          bestD2 = d2
          bestDx = dx
          bestDy = dy

          // perfect adjacency is d2=1 (orthogonal) or d2=2 (diagonal)
          if (d2 === 1) break
        }
      }

      const dirX = sign(bestDx)
      const dirY = sign(bestDy)
      map.set(idx, angleFromDelta(dirX, dirY))
    }

    return map
  }, [cells, mapSize, standSet])

  return (
    <View style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}>
      {Array.from({ length: mapSize * mapSize }).map((_, i) => {
        const x = i % mapSize
        const y = Math.floor(i / mapSize)

        const type = cells[i] ?? 'empty'
        const showStand = type === 'empty' && standSet.has(i)
        const rotation = showStand ? (standFacingByIndex.get(i) ?? '0deg') : '0deg'

        return (
          <View
            key={`${trackId}_${i}`}
            style={[
              styles.cell,
              {
                width: cellPx,
                height: cellPx,
                marginRight: x === mapSize - 1 ? 0 : GRID_GAP,
                marginBottom: y === mapSize - 1 ? 0 : GRID_GAP,
              },
              type === 'empty' && styles.empty,
              type === 'infield' && styles.infield,
              type === 'track' && styles.track,
            ]}
          >
            {showStand ? (
              <View style={[styles.standIcon, { transform: [{ rotate: rotation }] }]}>
                <View style={styles.standBar} />
                <View style={styles.standBar} />
                <View style={styles.standBar} />
                <View style={styles.standFront} />
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 18,
    overflow: 'hidden',

    // this becomes the grid line color
    backgroundColor: 'rgba(0,0,0,0.10)',
  },

  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },

  empty: { backgroundColor: '#FFFFFF' },
  infield: { backgroundColor: 'rgba(30, 160, 80, 0.12)' },
  track: { backgroundColor: 'rgba(20, 20, 20, 0.18)' },

  // "stands" mini icon (rotated to face the track)
  standIcon: {
    width: '72%',
    height: '58%',
    justifyContent: 'space-between',
  },
  standBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  standFront: {
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
})
