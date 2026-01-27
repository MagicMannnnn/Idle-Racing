// src/components/maps/TrackMapView.tsx
import React, { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTrackMaps } from '@/src/state/useTrackMaps'

type Props = {
  trackId: string
  sizePx?: number
  initialGridSize?: number
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
  const rx = -dy
  const ry = dx

  if (rx === 1 && ry === 0) return '0deg'
  if (rx === 1 && ry === 1) return '45deg'
  if (rx === 0 && ry === 1) return '90deg'
  if (rx === -1 && ry === 1) return '135deg'
  if (rx === -1 && ry === 0) return '180deg'
  if (rx === -1 && ry === -1) return '-135deg'
  if (rx === 0 && ry === -1) return '-90deg'
  if (rx === 1 && ry === -1) return '-45deg'
  return '0deg'
}

// ----------------- Kerb rendering helpers -----------------
type Side = 'N' | 'E' | 'S' | 'W'
type KerbSides = { N?: boolean; E?: boolean; S?: boolean; W?: boolean }
type Kerb = { inner: KerbSides; outer: KerbSides; innerMid: KerbSides }

function KerbStrip({ side, inset }: { side: Side; inset: 'edge' | 'mid' }) {
  // red/white striped kerb
  const stripes = 6
  const isHorizontal = side === 'N' || side === 'S'

  const wrapStyle = isHorizontal
    ? [
        styles.kerbStrip,
        styles.kerbStripH,
        inset === 'edge' ? (side === 'N' ? styles.kerbTop : styles.kerbBottom) : styles.kerbMidH,
      ]
    : [
        styles.kerbStrip,
        styles.kerbStripV,
        inset === 'edge' ? (side === 'W' ? styles.kerbLeft : styles.kerbRight) : styles.kerbMidV,
      ]

  return (
    <View pointerEvents="none" style={wrapStyle}>
      {Array.from({ length: stripes }).map((_, i) => (
        <View
          // eslint-disable-next-line react/no-array-index-key
          key={`${side}_${inset}_${i}`}
          style={[
            styles.kerbStripe,
            isHorizontal ? styles.kerbStripeH : styles.kerbStripeV,
            i % 2 === 0 ? styles.kerbRed : styles.kerbWhite,
          ]}
        />
      ))}
    </View>
  )
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

    // stable ranking: seed must NOT depend on current capacity
    const seedA = fnv1a32(trackId)
    const seedB = layoutHash(cells)
    const seedC = mix32(mapSize)
    const seed = mix32(seedA ^ seedB ^ seedC)

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
          if (d2 === 1) break
        }
      }

      const dirX = sign(bestDx)
      const dirY = sign(bestDy)
      map.set(idx, angleFromDelta(dirX, dirY))
    }

    return map
  }, [cells, mapSize, standSet])

  /**
   * Kerbs
   * - OUTER kerbs: keep your existing behavior (near-corner, on sides touching empty)
   * - INNER kerbs (new): for track cells where 3/4 neighbors are track (NOT 4/4),
   *   place kerbs "halfway inside" the cell on each side that touches a non-track neighbor.
   */
  const kerbsByIndex = useMemo(() => {
    const map = new Map<number, Kerb>()
    if (!cells.length) return map

    const idxAt = (x: number, y: number) => y * mapSize + x
    const cellAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= mapSize || y >= mapSize) return 'empty'
      return cells[idxAt(x, y)] ?? 'empty'
    }
    const isTrack = (x: number, y: number) => cellAt(x, y) === 'track'
    const isEmpty = (x: number, y: number) => cellAt(x, y) === 'empty'

    const cornerIdx = new Set<number>()
    const nearCornerIdx = new Set<number>()

    // --- detect corners for OUTER kerbs ---
    for (let y = 0; y < mapSize; y++) {
      for (let x = 0; x < mapSize; x++) {
        if (!isTrack(x, y)) continue

        const n = isTrack(x, y - 1)
        const s = isTrack(x, y + 1)
        const w = isTrack(x - 1, y)
        const e = isTrack(x + 1, y)

        const count = (n ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0) + (e ? 1 : 0)
        const straight = (n && s) || (w && e)

        if (count === 2 && !straight) {
          const idx = idxAt(x, y)
          cornerIdx.add(idx)
          if (n) nearCornerIdx.add(idxAt(x, y - 1))
          if (s) nearCornerIdx.add(idxAt(x, y + 1))
          if (w) nearCornerIdx.add(idxAt(x - 1, y))
          if (e) nearCornerIdx.add(idxAt(x + 1, y))
        }
      }
    }

    // --- assign kerb edges ---
    for (let y = 0; y < mapSize; y++) {
      for (let x = 0; x < mapSize; x++) {
        if (!isTrack(x, y)) continue
        const idx = idxAt(x, y)

        const inner: KerbSides = {}
        const outer: KerbSides = {}
        const innerMid: KerbSides = {}

        // OUTER kerbs: only on near-corner cells, on sides that touch empty
        if (nearCornerIdx.has(idx)) {
          if (isEmpty(x, y - 1)) outer.N = true
          if (isEmpty(x + 1, y)) outer.E = true
          if (isEmpty(x, y + 1)) outer.S = true
          if (isEmpty(x - 1, y)) outer.W = true
        }

        // INNER kerbs (new rule):
        // if 3/4 neighbors are track (but not 4/4), then for each side adjacent to NON-track,
        // place a kerb halfway inside the track cell on that side.
        const nT = isTrack(x, y - 1)
        const eT = isTrack(x + 1, y)
        const sT = isTrack(x, y + 1)
        const wT = isTrack(x - 1, y)
        const countTrack = (nT ? 1 : 0) + (eT ? 1 : 0) + (sT ? 1 : 0) + (wT ? 1 : 0)

        if (countTrack === 3) {
          if (!nT) innerMid.N = true
          if (!eT) innerMid.E = true
          if (!sT) innerMid.S = true
          if (!wT) innerMid.W = true
        }

        // keep object only if any kerb flags exist
        if (
          inner.N ||
          inner.E ||
          inner.S ||
          inner.W ||
          outer.N ||
          outer.E ||
          outer.S ||
          outer.W ||
          innerMid.N ||
          innerMid.E ||
          innerMid.S ||
          innerMid.W
        ) {
          map.set(idx, { inner, outer, innerMid })
        }
      }
    }

    return map
  }, [cells, mapSize])

  return (
    <View style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}>
      {Array.from({ length: mapSize * mapSize }).map((_, i) => {
        const x = i % mapSize
        const y = Math.floor(i / mapSize)

        const type = cells[i] ?? 'empty'

        const showStand = type === 'empty' && standSet.has(i)
        const standRotation = showStand ? (standFacingByIndex.get(i) ?? '0deg') : '0deg'

        const kerb = type === 'track' ? kerbsByIndex.get(i) : undefined

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
            {/* Kerbs */}
            {type === 'track' && kerb ? (
              <>
                {/* OUTER kerbs (edge) */}
                {kerb.outer.N ? <KerbStrip side="N" inset="edge" /> : null}
                {kerb.outer.E ? <KerbStrip side="E" inset="edge" /> : null}
                {kerb.outer.S ? <KerbStrip side="S" inset="edge" /> : null}
                {kerb.outer.W ? <KerbStrip side="W" inset="edge" /> : null}

                {/* INNER kerbs (halfway inside) */}
                {kerb.innerMid.N ? <KerbStrip side="N" inset="mid" /> : null}
                {kerb.innerMid.E ? <KerbStrip side="E" inset="mid" /> : null}
                {kerb.innerMid.S ? <KerbStrip side="S" inset="mid" /> : null}
                {kerb.innerMid.W ? <KerbStrip side="W" inset="mid" /> : null}
              </>
            ) : null}

            {/* Stands */}
            {showStand ? (
              <View style={[styles.standIcon, { transform: [{ rotate: standRotation }] }]}>
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
    backgroundColor: 'rgba(0,0,0,0.10)', // grid lines
  },

  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    overflow: 'hidden', // clip kerbs
  },

  empty: { backgroundColor: '#FFFFFF' },
  infield: { backgroundColor: 'rgba(30, 160, 80, 0.12)' },
  track: { backgroundColor: 'rgba(20, 20, 20, 0.18)' },

  // ---------- Stands ----------
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

  // ---------- Kerbs ----------
  kerbStrip: {
    position: 'absolute',
    overflow: 'hidden',
  },

  // Edge kerbs
  kerbStripH: {
    left: 0,
    right: 0,
    height: 6,
    flexDirection: 'row',
  },
  kerbStripV: {
    top: 0,
    bottom: 0,
    width: 6,
    flexDirection: 'column',
  },
  kerbTop: { top: 0 },
  kerbBottom: { bottom: 0 },
  kerbLeft: { left: 0 },
  kerbRight: { right: 0 },

  // Mid (halfway-inside) kerbs
  kerbMidH: {
    left: 0,
    right: 0,
    top: '50%',
    height: 6,
    flexDirection: 'row',
    transform: [{ translateY: -3 }],
  },
  kerbMidV: {
    top: 0,
    bottom: 0,
    left: '50%',
    width: 6,
    flexDirection: 'column',
    transform: [{ translateX: -3 }],
  },

  kerbStripe: {},
  kerbStripeH: { flex: 1 },
  kerbStripeV: { flex: 1 },

  kerbRed: { backgroundColor: '#D32F2F' },
  kerbWhite: { backgroundColor: '#FFFFFF' },
})
