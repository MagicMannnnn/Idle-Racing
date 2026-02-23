import { type CarAnim, useTrackCars } from '@hooks/useTrackCars'
import { useIsFocused } from '@react-navigation/native'
import { useTrackMaps } from '@state/useTrackMaps'
import {
  addDeg,
  angleFromDelta,
  angleFromOrthSum,
  buildTrackLoop,
  fnv1a32,
  layoutHash,
  mix32,
  sign,
  toXY,
} from '@utils/map'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { CellCars } from './CellCars'
import { StandIcon } from './StandIcon'
import { TrackLeaderboard } from './TrackLeaderboard'

type Props = {
  trackId: string
  sizePx?: number
  initialGridSize?: number
  capacity: number
  maxCapacity: number
  entertainment?: number
  maxEntertainment?: number
  trackSize: number
  seed: number
  startedAt: number
  durationMs: number
  teamAverageRating: number // Team's average rating (for comparison)
  meanCompetitorRating: number // Mean rating for competitor field (normal distribution center)
  teamDriverRatings?: number[] // Ratings for team drivers (car IDs 1...N), calculated from driver+car ratings
  speedVariance?: number // Optional speed variance (default: from settings). Use 12 for race tab.
  onRaceStateUpdate?: (cars: CarAnim[], carRatings: number[]) => void // Callback to receive live car positions and ratings
}

const GRID_GAP = 1
const GRID_PAD = 1

type Side = 'N' | 'E' | 'S' | 'W'
type KerbSides = { N?: boolean; E?: boolean; S?: boolean; W?: boolean }
type InnerCorner = 'NE' | 'SE' | 'SW' | 'NW'

type TrackKerb = { outer: KerbSides }

const KerbStrip = React.memo(({ side }: { side: Side }) => {
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
})

const KerbCorner = React.memo(({ corner }: { corner: InnerCorner }) => {
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
})

const CheckerboardOverlay = React.memo(({ size }: { size: number }) => {
  const squares = 6
  const squareSize = size / squares
  const rows = Array.from({ length: squares })
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        top: 0,
        left: 0,
        flexDirection: 'column',
        zIndex: 10,
      }}
    >
      {rows.map((_, row) => (
        <View key={row} style={{ flexDirection: 'row', flex: 1 }}>
          {rows.map((_, col) => {
            const isWhite = (row + col) % 2 === 0
            return (
              <View
                key={col}
                style={{
                  width: squareSize,
                  height: squareSize,
                  backgroundColor: isWhite ? '#fff' : 'transparent',
                  opacity: isWhite ? 0.95 : 0,
                }}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
})

const GridCell = React.memo(
  ({
    trackId,
    index,
    cellPx,
    mapSize,
    type,
    firstTrackIdx,
    trackKerb,
    innerCorners,
    showStand,
    standRotation,
    standSeed,
    entertainmentValue,
  }: {
    trackId: string
    index: number
    cellPx: number
    mapSize: number
    type: string
    firstTrackIdx: number
    trackKerb?: TrackKerb
    innerCorners?: InnerCorner[]
    showStand: boolean
    standRotation: string
    standSeed: number
    entertainmentValue: number
  }) => {
    const x = index % mapSize
    const y = Math.floor(index / mapSize)

    return (
      <View
        key={`${trackId}_${index}`}
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
        {index === firstTrackIdx && type === 'track' ? <CheckerboardOverlay size={cellPx} /> : null}
        {type === 'track' && trackKerb ? (
          <>
            {trackKerb.outer.N ? <KerbStrip side="N" /> : null}
            {trackKerb.outer.E ? <KerbStrip side="E" /> : null}
            {trackKerb.outer.S ? <KerbStrip side="S" /> : null}
            {trackKerb.outer.W ? <KerbStrip side="W" /> : null}
          </>
        ) : null}

        {innerCorners?.length
          ? innerCorners.map((c) => <KerbCorner key={`${trackId}_${index}_${c}`} corner={c} />)
          : null}

        {showStand && (
          <StandIcon
            standRotation={standRotation}
            seed={standSeed}
            minDotsPerBar={entertainmentValue === 0 ? 0 : 1 + Math.floor(entertainmentValue / 0.31)}
            entertainmentValue={entertainmentValue}
            size={Math.max(cellPx * 0.1, 6)}
          />
        )}
      </View>
    )
  },
)

export function DeterministicRaceView({
  trackId,
  initialGridSize = 5,
  capacity,
  maxCapacity,
  entertainment,
  maxEntertainment,
  trackSize,
  seed,
  startedAt,
  durationMs,
  teamAverageRating: _teamAverageRating,
  meanCompetitorRating,
  teamDriverRatings,
  speedVariance,
  onRaceStateUpdate,
}: Props) {
  const ensure = useTrackMaps((s: any) => s.ensure)
  const grid = useTrackMaps((s: any) => s.get(trackId))

  const [showCarsVisual, setShowCarsVisual] = useState(false)
  const [runSim, setRunSim] = useState(false)
  const [entertainmentValue, setEntertainmentValue] = useState(0)

  const isFocused = useIsFocused()

  const firstTrackIdx = useMemo(
    () => grid?.cells.findIndex((c: any) => c === 'track'),
    [grid?.cells],
  )

  const [leaderId, setLeaderId] = useState<number | null>(null)

  // Update visual state based on elapsed time
  // Use longer interval when not focused to save performance
  useEffect(() => {
    const interval = isFocused ? 100 : 1000 // Update less frequently when not focused
    const t = setInterval(() => {
      const now = Date.now()
      const elapsedMs = now - startedAt
      const isActive = elapsedMs >= 0 && elapsedMs < durationMs
      const inCooldown = elapsedMs >= durationMs && elapsedMs < durationMs + 5000 // 5s cooldown

      const shouldShowCars = isActive || inCooldown
      const shouldRunSim = isActive

      // Calculate entertainment value
      const entValue =
        isActive && entertainment && maxEntertainment ? entertainment / maxEntertainment : 0

      setShowCarsVisual((prev) => (prev !== shouldShowCars ? shouldShowCars : prev))
      setRunSim((prev) => (prev !== shouldRunSim ? shouldRunSim : prev))
      setEntertainmentValue((prev) => (prev !== entValue ? entValue : prev))
    }, interval)
    return () => clearInterval(t)
  }, [startedAt, durationMs, entertainment, maxEntertainment, isFocused])

  useEffect(() => {
    ensure(trackId, initialGridSize)
  }, [ensure, trackId, initialGridSize])

  const mapSize = grid?.size ?? initialGridSize
  const cells = grid?.cells ?? []

  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const isLandscape = windowWidth > windowHeight
  const isWeb = Platform.OS === 'web'

  const cellPx = useMemo(() => {
    const maxSize = isWeb
      ? Math.min(windowWidth - (isLandscape ? 420 : 60), windowHeight - 280)
      : Math.min(windowWidth - 32, windowHeight * 0.8)
    const inner = maxSize - GRID_PAD * 2 - GRID_GAP * (mapSize - 1)
    return Math.max(6, Math.floor(inner / mapSize))
  }, [windowWidth, windowHeight, mapSize, isWeb, isLandscape])

  const wrapW = cellPx * mapSize + GRID_GAP * (mapSize - 1) + GRID_PAD * 2

  const leaderboardHeight = useMemo(() => {
    if (!isWeb) return 470
    return Math.max(300, windowHeight - 280)
  }, [isWeb, windowHeight])

  const loop = useMemo(() => buildTrackLoop(cells ?? [], mapSize), [cells, mapSize])

  // Generate car ratings with tight distribution around mean
  // Mean = meanCompetitorRating, StdDev = 0.15-0.225 (most stay within 0.3 of mean)
  // Team cars (IDs 1...N) use actual driver+car ratings, competitors use random ratings
  // Starting grid is sorted by rating in useTrackCars: lowest rated starts first (reverse grid)
  const carRatings = useMemo(() => {
    const carCount = Math.min(trackSize, Math.floor(loop.length * 0.5), 20)
    if (carCount === 0) return []

    // Box-Muller transform for normal distribution
    const ratings: number[] = []
    let rng = mix32(seed ^ 0x9e3779b9) // Add variation to seed

    const nextRandom = () => {
      rng = mix32(rng)
      return rng / 0xffffffff
    }

    // Tighter standard deviation: most drivers stay within 0.3 of mean
    // Base stdDev of 0.15 means ~68% within 0.15, ~95% within 0.3 of mean
    // Scale slightly with car count for variety: 2 cars tight, 20 cars more spread
    const stdDev = 0.15 * (1 + (carCount - 2) / 36) // 0.15-0.225 range

    // Calculate rating bounds
    const minRating = 0.5
    const maxRating = Math.min(meanCompetitorRating * 2, 5.0)

    for (let i = 0; i < carCount; i++) {
      // Box-Muller transform to generate normal distribution
      const u1 = nextRandom()
      const u2 = nextRandom()
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)

      // Scale to mean=meanCompetitorRating with tight stdDev
      const rating = meanCompetitorRating + z0 * stdDev

      // Clamp to [0.5, min(meanCompetitorRating * 2, 5.0)]
      const clampedRating = Math.max(minRating, Math.min(maxRating, rating))
      ratings.push(clampedRating)
    }

    // Replace ratings for team cars (car IDs 1...N) with actual driver+car ratings
    const teamCount = teamDriverRatings?.length || 0
    if (teamDriverRatings && teamCount > 0) {
      for (let i = 0; i < Math.min(teamCount, ratings.length); i++) {
        ratings[i] = teamDriverRatings[i]
      }
    }

    return ratings
  }, [seed, trackSize, loop.length, meanCompetitorRating, teamDriverRatings])

  const { cars, start, stop, newRace } = useTrackCars({
    loop,
    width: mapSize,
    carCount: Math.min(trackSize, Math.floor(loop.length * 0.5), 20),
    cellPx,
    gapPx: GRID_GAP,
    padPx: GRID_PAD,
    carRatings,
    speedVariance,
  })

  const raceInitializedRef = useRef(false)
  const lastSeedRef = useRef<number | null>(null)

  // Reset race initialization when seed changes
  useEffect(() => {
    if (lastSeedRef.current !== seed) {
      raceInitializedRef.current = false
      lastSeedRef.current = seed
    }
  }, [seed])

  // Stop only when race is not supposed to be running
  useEffect(() => {
    if (!runSim) {
      stop()
    }
    return stop
  }, [runSim, stop])

  // Start race when ready and elapsed time > 0
  // Keep running even when not focused to maintain race state
  useEffect(() => {
    if (!runSim) return
    if (loop.length === 0) return
    if (cars.length === 0) return

    const now = Date.now()
    const elapsedMs = now - startedAt

    // Only start animation after elapsed time > 0
    if (elapsedMs <= 0) return

    // Initialize race with seed (once per seed)
    if (!raceInitializedRef.current) {
      raceInitializedRef.current = true
      newRace(seed)
      // Small delay to ensure initialization completes before starting
      setTimeout(() => {
        start()
      }, 50)
      return
    }

    start()
  }, [runSim, loop.length, cars.length, newRace, start, seed, startedAt])

  // Provide live race state updates to parent component
  useEffect(() => {
    if (!onRaceStateUpdate) return
    if (cars.length === 0) return
    if (!runSim) return

    // Update parent with current car states and ratings periodically
    const interval = setInterval(() => {
      onRaceStateUpdate(cars, carRatings)
    }, 250) // 4 times per second

    return () => clearInterval(interval)
  }, [cars, carRatings, onRaceStateUpdate, runSim])

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
    const seedVal = mix32(seedA ^ seedB ^ seedC)

    const scored = emptyIdx.map((idx) => ({ idx, score: mix32(seedVal ^ idx) / 0xffffffff }))
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
  }, [cells, mapSize, standSet, trackId])

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
    <SafeAreaView style={styles.safe} edges={isWeb ? ['top', 'left', 'right', 'bottom'] : []}>
      {isWeb ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            flexGrow: 1,
            paddingVertical: isLandscape ? 24 : 12,
            paddingHorizontal: 12,
          }}
          showsVerticalScrollIndicator={!isLandscape}
        >
          <View
            style={{
              flex: isLandscape ? 1 : undefined,
              flexDirection: isLandscape ? 'row' : 'column',
              alignSelf: 'center',
              gap: 12,
              alignItems: isLandscape ? 'flex-start' : 'center',
              justifyContent: isLandscape ? 'center' : 'flex-start',
            }}
          >
            <View style={{ width: wrapW, alignSelf: 'center' }}>
              <View style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}>
                {Array.from({ length: mapSize * mapSize }).map((_, i) => {
                  const type = cells[i] ?? 'empty'
                  const showStand = type === 'empty' && standSet.has(i)
                  const standRotation = showStand
                    ? addDeg(standFacingByIndex.get(i) ?? '0deg', 180)
                    : '0deg'
                  const trackKerb = type === 'track' ? trackKerbsByIndex.get(i) : undefined
                  const innerCorners = type !== 'track' ? innerCornersByIndex.get(i) : undefined

                  return (
                    <GridCell
                      key={`${trackId}_${i}`}
                      trackId={trackId}
                      index={i}
                      cellPx={cellPx}
                      mapSize={mapSize}
                      type={type}
                      firstTrackIdx={firstTrackIdx}
                      trackKerb={trackKerb}
                      innerCorners={innerCorners}
                      showStand={showStand}
                      standRotation={standRotation}
                      standSeed={fnv1a32(trackId + i)}
                      entertainmentValue={entertainmentValue}
                    />
                  )
                })}

                {showCarsVisual ? (
                  <CellCars cars={cars} carW={cellPx / 6} carH={cellPx / 4} leaderId={leaderId} />
                ) : null}
              </View>
            </View>

            <View style={{ width: isLandscape ? 350 : wrapW, alignSelf: 'center' }}>
              <TrackLeaderboard cars={cars} height={leaderboardHeight} setLeaderId={setLeaderId} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
        >
          <View
            style={{
              flexDirection: isLandscape ? 'row' : 'column',
              alignSelf: 'center',
              gap: 12,
              alignItems: isLandscape ? 'flex-start' : 'center',
            }}
          >
            <View style={{ width: wrapW, alignSelf: 'center' }}>
              <View style={[styles.wrap, { width: wrapW, height: wrapW, padding: GRID_PAD }]}>
                {Array.from({ length: mapSize * mapSize }).map((_, i) => {
                  const type = cells[i] ?? 'empty'
                  const showStand = type === 'empty' && standSet.has(i)
                  const standRotation = showStand
                    ? addDeg(standFacingByIndex.get(i) ?? '0deg', 180)
                    : '0deg'
                  const trackKerb = type === 'track' ? trackKerbsByIndex.get(i) : undefined
                  const innerCorners = type !== 'track' ? innerCornersByIndex.get(i) : undefined

                  return (
                    <GridCell
                      key={`${trackId}_${i}`}
                      trackId={trackId}
                      index={i}
                      cellPx={cellPx}
                      mapSize={mapSize}
                      type={type}
                      firstTrackIdx={firstTrackIdx}
                      trackKerb={trackKerb}
                      innerCorners={innerCorners}
                      showStand={showStand}
                      standRotation={standRotation}
                      standSeed={fnv1a32(trackId + i)}
                      entertainmentValue={entertainmentValue}
                    />
                  )
                })}

                {showCarsVisual ? (
                  <CellCars cars={cars} carW={cellPx / 6} carH={cellPx / 4} leaderId={leaderId} />
                ) : null}
              </View>
            </View>

            <View style={{ width: isLandscape ? 350 : wrapW, alignSelf: 'center' }}>
              <TrackLeaderboard cars={cars} height={470} setLeaderId={setLeaderId} />
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

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
  track: { backgroundColor: 'rgba(20, 20, 20, 0.18)', overflow: 'visible' },

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
