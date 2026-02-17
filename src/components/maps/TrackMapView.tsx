import { useTrackMaps } from '@state/useTrackMaps'
import {
  addDeg,
  angleFromDelta,
  angleFromOrthSum,
  fnv1a32,
  layoutHash,
  mix32,
  sign,
  toXY,
} from '@utils/map'
import React, { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

type Props = {
  trackId: string
  sizePx?: number
  initialGridSize?: number
  capacity: number
  maxCapacity: number
}

const GRID_GAP = 1
const GRID_PAD = 1

type Side = 'N' | 'E' | 'S' | 'W'
type KerbSides = { N?: boolean; E?: boolean; S?: boolean; W?: boolean }
type InnerCorner = 'NE' | 'SE' | 'SW' | 'NW'
type TrackKerb = { outer: KerbSides }

function KerbStrip({ side }: { side: Side }) {
  const stripes = 6
  const isHorizontal = side === 'N' || side === 'S'
  const wrapStyle = isHorizontal
    ? [styles.kerbStrip, styles.kerbStripH, side === 'N' ? styles.kerbTop : styles.kerbBottom]
    : [styles.kerbStrip, styles.kerbStripV, side === 'W' ? styles.kerbLeft : styles.kerbRight]

  return (
    <View pointerEvents="none" style={wrapStyle}>
      {Array.from({ length: stripes }).map((_, i) => (
        <View
          key={`${side}_${i}`}
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

function KerbCorner({ corner }: { corner: InnerCorner }) {
  const thickness = 6
  const stripes = 6

  const INSET = 0

  const BOX = '56%' as const

  const isTop = corner === 'NE' || corner === 'NW'
  const isLeft = corner === 'NW' || corner === 'SW'
  const isRight = !isLeft
  const isBottom = !isTop

  const boxStyle = {
    position: 'absolute' as const,
    width: BOX,
    height: BOX,
    top: isTop ? INSET : undefined,
    bottom: isBottom ? INSET : undefined,
    left: isLeft ? INSET : undefined,
    right: isRight ? INSET : undefined,
  }

  const hLegStyle = {
    position: 'absolute' as const,
    height: thickness,
    left: 0,
    right: 0,
    top: isTop ? 0 : undefined,
    bottom: isBottom ? 0 : undefined,
    flexDirection: 'row' as const,
    overflow: 'hidden' as const,
    borderRadius: 3,
  }

  const vLegStyle = {
    position: 'absolute' as const,
    width: thickness,
    top: 0,
    bottom: 0,
    left: isLeft ? 0 : undefined,
    right: isRight ? 0 : undefined,
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
    borderRadius: 3,
  }

  return (
    <View pointerEvents="none" style={boxStyle}>
      <View pointerEvents="none" style={hLegStyle}>
        {Array.from({ length: stripes }).map((_, i) => (
          <View
            key={`ch_${corner}_${i}`}
            style={[
              styles.kerbStripe,
              styles.kerbStripeH,
              i % 2 === 0 ? styles.kerbRed : styles.kerbWhite,
            ]}
          />
        ))}
      </View>

      <View pointerEvents="none" style={vLegStyle}>
        {Array.from({ length: stripes }).map((_, i) => (
          <View
            key={`cv_${corner}_${i}`}
            style={[
              styles.kerbStripe,
              styles.kerbStripeV,
              i % 2 === 0 ? styles.kerbRed : styles.kerbWhite,
            ]}
          />
        ))}
      </View>
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
  const ensure = useTrackMaps((s: any) => s.ensure)
  const grid = useTrackMaps((s: any) => s.get(trackId))

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
    for (let i = 0; i < cells.length; i++) if (cells[i] === 'empty') emptyIdx.push(i)
    if (emptyIdx.length === 0) return new Set<number>()

    const fill = maxCapacity > 0 ? Math.max(0, Math.min(1, capacity / maxCapacity)) : 0
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
  }, [cells, trackId, capacity, maxCapacity, mapSize])
  const standFacingByIndex = useMemo(() => {
    const map = new Map<number, string>()
    if (!cells.length || standSet.size === 0) return map

    const idxAt = (x: number, y: number) => y * mapSize + x
    const cellAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= mapSize || y >= mapSize) return 'empty'
      return cells[idxAt(x, y)] ?? 'empty'
    }
    const isTrack = (x: number, y: number) => cellAt(x, y) === 'track'

    const tracksAll: Array<{ x: number; y: number }> = []
    for (let i = 0; i < cells.length; i++)
      if (cells[i] === 'track') tracksAll.push(toXY(i, mapSize))
    if (tracksAll.length === 0) return map

    for (const idx of standSet) {
      const s = toXY(idx, mapSize)

      const hasN = isTrack(s.x, s.y - 1)
      const hasE = isTrack(s.x + 1, s.y)
      const hasS = isTrack(s.x, s.y + 1)
      const hasW = isTrack(s.x - 1, s.y)

      const nsOnly = hasN && hasS && !hasE && !hasW
      const ewOnly = hasE && hasW && !hasN && !hasS
      if (nsOnly || ewOnly) {
        const pickFirst = (mix32(fnv1a32(trackId) ^ idx) & 1) === 0
        if (nsOnly) map.set(idx, pickFirst ? angleFromDelta(0, -1) : angleFromDelta(0, 1))
        else map.set(idx, pickFirst ? angleFromDelta(1, 0) : angleFromDelta(-1, 0))
        continue
      }
      let sumX = 0
      let sumY = 0
      let count = 0

      if (hasN) {
        sumY += -1
        count++
      }
      if (hasE) {
        sumX += 1
        count++
      }
      if (hasS) {
        sumY += 1
        count++
      }
      if (hasW) {
        sumX += -1
        count++
      }

      if (count > 0) {
        if (sumX === 0 && sumY === 0) {
          const present: Array<[number, number]> = []
          if (hasN) present.push([0, -1])
          if (hasE) present.push([1, 0])
          if (hasS) present.push([0, 1])
          if (hasW) present.push([-1, 0])

          const pick = present[mix32(fnv1a32(trackId) ^ idx) % present.length]
          map.set(idx, angleFromDelta(pick[0], pick[1]))
        } else {
          map.set(idx, angleFromOrthSum(sumX, sumY))
        }
        continue
      }
      let bestD2 = Number.POSITIVE_INFINITY
      let bestDx = 0
      let bestDy = 0
      for (const t of tracksAll) {
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
      map.set(idx, angleFromDelta(sign(bestDx), sign(bestDy)))
    }

    return map
  }, [cells, mapSize, standSet])

  const trackKerbsByIndex = useMemo(() => {
    const map = new Map<number, TrackKerb>()
    if (!cells.length) return map

    const idxAt = (x: number, y: number) => y * mapSize + x
    const cellAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= mapSize || y >= mapSize) return 'empty'
      return cells[idxAt(x, y)] ?? 'empty'
    }

    const isTrack = (x: number, y: number) => cellAt(x, y) === 'track'
    const isEmpty = (x: number, y: number) => cellAt(x, y) === 'empty'

    const nearCornerIdx = new Set<number>()
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
          if (n) nearCornerIdx.add(idxAt(x, y - 1))
          if (s) nearCornerIdx.add(idxAt(x, y + 1))
          if (w) nearCornerIdx.add(idxAt(x - 1, y))
          if (e) nearCornerIdx.add(idxAt(x + 1, y))
        }
      }
    }

    for (let y = 0; y < mapSize; y++) {
      for (let x = 0; x < mapSize; x++) {
        if (!isTrack(x, y)) continue
        const idx = idxAt(x, y)

        const outer: KerbSides = {}

        if (nearCornerIdx.has(idx)) {
          if (isEmpty(x, y - 1)) outer.N = true
          if (isEmpty(x + 1, y)) outer.E = true
          if (isEmpty(x, y + 1)) outer.S = true
          if (isEmpty(x - 1, y)) outer.W = true
        }

        if (outer.N || outer.E || outer.S || outer.W) {
          map.set(idx, { outer })
        }
      }
    }

    return map
  }, [cells, mapSize])

  const innerCornersByIndex = useMemo(() => {
    const map = new Map<number, InnerCorner[]>()
    if (!cells.length) return map

    const idxAt = (x: number, y: number) => y * mapSize + x
    const cellAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= mapSize || y >= mapSize) return 'empty'
      return cells[idxAt(x, y)] ?? 'empty'
    }
    const isTrack = (x: number, y: number) => cellAt(x, y) === 'track'

    const suppressed = new Set<number>()
    for (const [idx, kerb] of trackKerbsByIndex.entries()) {
      const { x, y } = toXY(idx, mapSize)
      if (kerb.outer.N) suppressed.add(idxAt(x, y - 1))
      if (kerb.outer.E) suppressed.add(idxAt(x + 1, y))
      if (kerb.outer.S) suppressed.add(idxAt(x, y + 1))
      if (kerb.outer.W) suppressed.add(idxAt(x - 1, y))
    }

    const pushUnique = (idx: number, c: InnerCorner) => {
      if (suppressed.has(idx)) return

      const arr = map.get(idx)
      if (!arr) {
        map.set(idx, [c])
        return
      }
      if (!arr.includes(c)) arr.push(c)
    }

    for (let y = 0; y < mapSize - 1; y++) {
      for (let x = 0; x < mapSize - 1; x++) {
        const tl = isTrack(x, y)
        const tr = isTrack(x + 1, y)
        const bl = isTrack(x, y + 1)
        const br = isTrack(x + 1, y + 1)

        const trackCount = (tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0)
        if (trackCount !== 3) continue

        if (!tl) pushUnique(idxAt(x, y), 'SE')
        else if (!tr) pushUnique(idxAt(x + 1, y), 'SW')
        else if (!bl) pushUnique(idxAt(x, y + 1), 'NE')
        else if (!br) pushUnique(idxAt(x + 1, y + 1), 'NW')
      }
    }

    return map
  }, [cells, mapSize, trackKerbsByIndex])

  return (
    <View style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}>
      {Array.from({ length: mapSize * mapSize }).map((_, i) => {
        const x = i % mapSize
        const y = Math.floor(i / mapSize)

        const type = cells[i] ?? 'empty'

        const showStand = type === 'empty' && standSet.has(i)
        const standRotation = showStand ? addDeg(standFacingByIndex.get(i) ?? '0deg', 180) : '0deg'

        const trackKerb = type === 'track' ? trackKerbsByIndex.get(i) : undefined
        const innerCorners = type !== 'track' ? innerCornersByIndex.get(i) : undefined

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
            {type === 'track' && trackKerb ? (
              <>
                {trackKerb.outer.N ? <KerbStrip side="N" /> : null}
                {trackKerb.outer.E ? <KerbStrip side="E" /> : null}
                {trackKerb.outer.S ? <KerbStrip side="S" /> : null}
                {trackKerb.outer.W ? <KerbStrip side="W" /> : null}
              </>
            ) : null}

            {innerCorners?.length
              ? innerCorners.map((c) => <KerbCorner key={`${trackId}_${i}_${c}`} corner={c} />)
              : null}

            {showStand ? (
              <View style={[styles.standIcon, { transform: [{ rotate: standRotation }] }]}>
                <View style={styles.standBar} />
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
    backgroundColor: 'rgba(0,0,0,0.10)',
  },

  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    overflow: 'hidden',
  },

  empty: { backgroundColor: '#FFFFFF' },
  infield: { backgroundColor: 'rgba(30, 160, 80, 0.12)' },
  track: { backgroundColor: 'rgba(20, 20, 20, 0.18)' },

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

  kerbStrip: {
    position: 'absolute',
    overflow: 'hidden',
  },
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

  kerbStripe: {},
  kerbStripeH: { flex: 1 },
  kerbStripeV: { flex: 1 },
  kerbRed: { backgroundColor: '#D32F2F' },
  kerbWhite: { backgroundColor: '#FFFFFF' },
})
