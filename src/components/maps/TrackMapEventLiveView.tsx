import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { TrackMapView } from '@/src/components/maps/TrackMapView'
import { useTrackMaps } from '@/src/state/useTrackMaps'
import { useEvents } from '@/src/state/useEvents'

type Props = {
  trackId: string
  sizePx?: number
  initialGridSize?: number
  capacity: number
  maxCapacity: number
}

// Must match viewer’s layout constants
const GRID_GAP = 1
const GRID_PAD = 1

// ---------- Deterministic helpers (match viewer) ----------
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
function idxAt(x: number, y: number, size: number) {
  return y * size + x
}

// ---------- Track loop ordering (assumes a single closed loop) ----------
function buildTrackLoopIndices(cells: string[], size: number): number[] {
  const isTrackIdx = (i: number) => cells[i] === 'track'
  const neighbors4 = (i: number) => {
    const { x, y } = toXY(i, size)
    const out: number[] = []
    if (y > 0) out.push(idxAt(x, y - 1, size))
    if (x < size - 1) out.push(idxAt(x + 1, y, size))
    if (y < size - 1) out.push(idxAt(x, y + 1, size))
    if (x > 0) out.push(idxAt(x - 1, y, size))
    return out
  }

  // find any track tile
  const start = cells.findIndex((c) => c === 'track')
  if (start < 0) return []

  // pick an initial next neighbor
  const startNeighbors = neighbors4(start).filter(isTrackIdx)
  if (startNeighbors.length === 0) return []

  // deterministic initial direction: choose smallest index neighbor
  let prev = start
  let cur = startNeighbors.slice().sort((a, b) => a - b)[0]

  const loop: number[] = [start, cur]
  const visited = new Set<number>(loop)

  // walk until we return to start
  for (let guard = 0; guard < size * size * 4; guard++) {
    const nextCandidates = neighbors4(cur)
      .filter(isTrackIdx)
      .filter((n) => n !== prev)

    // if we can go back to start and we’ve built enough length, close
    if (nextCandidates.includes(start) && loop.length > 3) {
      loop.push(start)
      return loop
    }

    if (nextCandidates.length === 0) return [] // dead end

    // prefer unvisited candidate; if both visited, still pick deterministically
    const unvisited = nextCandidates.filter((n) => !visited.has(n))
    const next = (unvisited.length ? unvisited : nextCandidates).slice().sort((a, b) => a - b)[0]

    prev = cur
    cur = next
    loop.push(cur)
    visited.add(cur)
  }

  return []
}

// ---------- Convert indices to pixel path points ----------
function indicesToPoints(
  indices: number[],
  size: number,
  cellPx: number,
): Array<{ x: number; y: number }> {
  return indices.map((i) => {
    const { x, y } = toXY(i, size)
    const px = GRID_PAD + x * (cellPx + GRID_GAP) + cellPx / 2
    const py = GRID_PAD + y * (cellPx + GRID_GAP) + cellPx / 2
    return { x: px, y: py }
  })
}

// ---------- Spectator dots inside stand (empty) tiles ----------
function spectatorOffsets(trackId: string, tileIdx: number, count: number) {
  // returns [0..1] normalized offsets inside the tile
  const seed = mix32(fnv1a32(trackId) ^ tileIdx)
  const out: Array<{ ox: number; oy: number }> = []
  let s = seed
  for (let i = 0; i < count; i++) {
    s = mix32(s ^ (i * 99991))
    const a = (s & 0xffff) / 0xffff
    const b = ((s >>> 16) & 0xffff) / 0xffff
    // keep away from edges a bit
    out.push({ ox: 0.2 + a * 0.6, oy: 0.2 + b * 0.6 })
  }
  return out
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

// ---------- Stand selection (matches viewer exactly) ----------
function computeStandSet(params: {
  trackId: string
  cells: string[]
  mapSize: number
  capacity: number
  maxCapacity: number
}) {
  const { trackId, cells, mapSize, capacity, maxCapacity } = params

  const emptyIdx: number[] = []
  for (let i = 0; i < cells.length; i++) if (cells[i] === 'empty') emptyIdx.push(i)
  if (emptyIdx.length === 0) return new Set<number>()

  const fill = maxCapacity > 0 ? clamp01(capacity / maxCapacity) : 0
  const k = Math.floor(emptyIdx.length * fill)

  if (k <= 0) return new Set<number>()
  if (k >= emptyIdx.length) return new Set<number>(emptyIdx)

  const seedA = fnv1a32(trackId)
  const seedB = layoutHash(cells)
  const seedC = mix32(mapSize)
  const seed = mix32(seedA ^ seedB ^ seedC)

  const scored = emptyIdx.map((idx) => ({ idx, score: mix32(seed ^ idx) / 0xffffffff }))
  scored.sort((a, b) => a.score - b.score)

  const set = new Set<number>()
  for (let i = 0; i < k; i++) set.add(scored[i].idx)
  return set
}

// ---------- Animated position along polyline ----------
function buildSegments(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return { segLen: [], cum: [], total: 0 }
  const segLen: number[] = []
  const cum: number[] = [0]
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const len = Math.hypot(dx, dy)
    segLen.push(len)
    total += len
    cum.push(total)
  }
  return { segLen, cum, total }
}

function pointAtDistance(
  points: Array<{ x: number; y: number }>,
  seg: ReturnType<typeof buildSegments>,
  dist: number,
) {
  const { segLen, cum, total } = seg
  if (points.length < 2 || total <= 0) return points[0] ?? { x: 0, y: 0 }

  // wrap
  let d = dist % total
  if (d < 0) d += total

  // find segment
  let i = 0
  while (i < segLen.length && cum[i + 1] < d) i++

  const a = points[i]
  const b = points[i + 1]
  const segStart = cum[i]
  const t = segLen[i] > 0 ? (d - segStart) / segLen[i] : 0
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function TrackMapEventLiveView({
  trackId,
  sizePx = 280,
  initialGridSize = 5,
  capacity,
  maxCapacity,
}: Props) {
  const ensure = useTrackMaps((s) => s.ensure)
  const grid = useTrackMaps((s) => s.get(trackId))

  const active = useEvents((s) => s.getActive(trackId))

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
    return computeStandSet({ trackId, cells, mapSize, capacity, maxCapacity })
  }, [cells, trackId, mapSize, capacity, maxCapacity])

  const trackPoints = useMemo(() => {
    if (!cells.length) return []
    const loopIdx = buildTrackLoopIndices(cells, mapSize)
    return indicesToPoints(loopIdx, mapSize, cellPx)
  }, [cells, mapSize, cellPx])

  const seg = useMemo(() => buildSegments(trackPoints), [trackPoints])

  // Cars: 3 cars, spaced evenly
  const carCount = 3

  // Animation driver
  const t = useRef(new Animated.Value(0)).current
  const animRef = useRef<Animated.CompositeAnimation | null>(null)
  const [tick, setTick] = useState(0) // forces re-render for car positions

  useEffect(() => {
    // Stop any prior animation when not active
    if (!active || seg.total <= 0) {
      animRef.current?.stop?.()
      animRef.current = null
      t.stopAnimation()
      t.setValue(0)
      return
    }

    // Speed: roughly proportional to path length; tune the divisor for “feel”
    const durationMs = Math.max(2500, Math.min(14000, seg.total * 18))

    t.setValue(0)
    animRef.current?.stop?.()
    animRef.current = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    animRef.current.start()

    const id = t.addListener(() => setTick((x) => x + 1))
    return () => {
      t.removeListener(id)
      animRef.current?.stop?.()
      animRef.current = null
    }
  }, [active, seg.total, t])

  // current progress
  const progress = useRef(0)
  useEffect(() => {
    const id = t.addListener(({ value }) => {
      progress.current = value
    })
    return () => t.removeListener(id)
  }, [t])

  // Build spectator dots only when event active
  const spectators = useMemo(() => {
    if (!active || !cells.length || standSet.size === 0) return []

    const dots: Array<{ x: number; y: number; key: string }> = []

    // Keep it light: 1–3 dots per “shown stand tile”
    for (const idx of standSet) {
      const { x, y } = toXY(idx, mapSize)

      const baseX = GRID_PAD + x * (cellPx + GRID_GAP)
      const baseY = GRID_PAD + y * (cellPx + GRID_GAP)

      const count = 2 // fixed looks good; can be scaled later
      const offs = spectatorOffsets(trackId, idx, count)
      for (let i = 0; i < offs.length; i++) {
        dots.push({
          x: baseX + offs[i].ox * cellPx,
          y: baseY + offs[i].oy * cellPx,
          key: `${trackId}_spec_${idx}_${i}`,
        })
      }
    }

    return dots
  }, [active, cells.length, standSet, mapSize, cellPx, trackId])

  // Car positions (computed from current progress)
  const cars = useMemo(() => {
    if (!active || seg.total <= 0 || trackPoints.length < 2) return []

    const p = progress.current
    const distBase = p * seg.total

    const out: Array<{ x: number; y: number; key: string }> = []
    for (let i = 0; i < carCount; i++) {
      const spacing = (seg.total / carCount) * i
      const pt = pointAtDistance(trackPoints, seg, distBase + spacing)
      out.push({ x: pt.x, y: pt.y, key: `${trackId}_car_${i}` })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tick, seg.total, trackPoints.length, trackId])

  return (
    <View style={{ width: wrapW, height: wrapW, alignSelf: 'center' }}>
      <TrackMapView
        trackId={trackId}
        sizePx={sizePx}
        initialGridSize={initialGridSize}
        capacity={capacity}
        maxCapacity={maxCapacity}
      />

      {/* Overlay only when event active */}
      {active ? (
        <View pointerEvents="none" style={[styles.overlay, { width: wrapW, height: wrapW }]}>
          {/* spectators */}
          {spectators.map((d) => (
            <View
              key={d.key}
              style={[
                styles.spectator,
                {
                  left: d.x - 2,
                  top: d.y - 2,
                },
              ]}
            />
          ))}

          {/* cars */}
          {cars.map((c) => (
            <View
              key={c.key}
              style={[
                styles.car,
                {
                  left: c.x - 3,
                  top: c.y - 3,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },

  car: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: 'rgba(40, 120, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },

  spectator: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(30, 30, 30, 0.55)',
  },
})
