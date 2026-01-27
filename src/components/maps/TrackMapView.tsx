import React, { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTrackMaps } from '@/src/state/useTrackMaps'

type Props = {
  trackId: string
  sizePx?: number
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
  // avalanche bits -> stable pseudo-random
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

function layoutHash(cells: string[]) {
  // stable layout fingerprint
  let h = 2166136261 >>> 0
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    // only a few chars, keep it cheap
    for (let j = 0; j < c.length; j++) {
      h ^= c.charCodeAt(j)
      h = Math.imul(h, 16777619)
    }
    h ^= 1249 // delimiter
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
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

  // ---- Decide which EMPTY cells actually show stands ----
  const standSet = useMemo(() => {
    if (!cells.length) return new Set<number>()

    const emptyIdx: number[] = []
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 'empty') emptyIdx.push(i)
    }
    if (emptyIdx.length === 0) return new Set<number>()

    const fill = maxCapacity > 0 ? Math.max(0, Math.min(1, capacity / maxCapacity)) : 0

    // Only 10% of stand blocks at full capacity; scaled by fill
    const k = Math.floor(emptyIdx.length * fill)
    if (k <= 0) return new Set<number>()

    const seedA = fnv1a32(trackId)
    const seedB = layoutHash(cells)
    const seedC = mix32((capacity << 1) ^ (maxCapacity << 9) ^ mapSize)

    const seed = mix32(seedA ^ seedB ^ seedC)

    // Deterministic selection: score each cell, take lowest k
    const scored = emptyIdx.map((idx) => {
      const score = mix32(seed ^ idx) / 0xffffffff
      return { idx, score }
    })

    scored.sort((a, b) => a.score - b.score)

    const set = new Set<number>()
    for (let i = 0; i < Math.min(k, scored.length); i++) set.add(scored[i].idx)
    return set
  }, [cells, trackId, capacity, maxCapacity, mapSize])

  return (
    <View style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}>
      {Array.from({ length: mapSize * mapSize }).map((_, i) => {
        const x = i % mapSize
        const y = Math.floor(i / mapSize)

        const type = cells[i] ?? 'empty'
        const showStand = type === 'empty' && standSet.has(i)

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
              <View style={styles.standIcon}>
                <View style={styles.standBar} />
                <View style={styles.standBar} />
                <View style={styles.standBar} />
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
    backgroundColor: 'rgba(0,0,0,0.10)', // grid lines
  },

  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },

  empty: { backgroundColor: '#FFFFFF' },
  infield: { backgroundColor: 'rgba(30, 160, 80, 0.12)' },
  track: { backgroundColor: 'rgba(20, 20, 20, 0.18)' },

  // "actual stands" mini icon
  standIcon: {
    width: '70%',
    height: '55%',
    justifyContent: 'space-between',
  },
  standBar: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
})
