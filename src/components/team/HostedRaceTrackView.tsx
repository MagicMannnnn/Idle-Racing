import { CellCars } from '@components/maps/CellCars'
import { StandIcon } from '@components/maps/StandIcon'
import { TrackLeaderboard } from '@components/maps/TrackLeaderboard'
import { Ionicons } from '@expo/vector-icons'
import { useMyTeamRaceCars } from '@hooks/useMyTeamRaceCars'
import { useIsFocused } from '@react-navigation/native'
import type { HostedRaceResultRow } from '@state/useMyTeamRaces'
import { useMyTeamRaces } from '@state/useMyTeamRaces'
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
import { router } from 'expo-router'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

type Props = {
  trackId: string
  driverIds: string[] // My Team driver IDs to race
  initialGridSize?: number
  onFinished?: (results: HostedRaceResultRow[]) => void
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

export function HostedRaceTrackView({
  trackId,
  driverIds,
  initialGridSize = 5,
  onFinished,
}: Props) {
  const renderStartTime = useRef(performance.now())
  const renderCount = useRef(0)

  const ensure = useTrackMaps((s: any) => s.ensure)
  const grid = useTrackMaps((s: any) => s.get(trackId))

  const getActiveRace = useMyTeamRaces((s: any) => s.getActiveRace)

  const activeRace = getActiveRace()

  // Visual state management
  const [showCarsVisual, setShowCarsVisual] = useState(false)
  const [runSim, setRunSim] = useState(false)
  const [entertainmentValue, setEntertainmentValue] = useState(0)

  const isFocused = useIsFocused()

  const firstTrackIdx = useMemo(
    () => grid?.cells.findIndex((c: any) => c === 'track'),
    [grid?.cells],
  )

  const [leaderId, setLeaderId] = useState<number | null>(null)

  useEffect(() => {
    ensure(trackId, initialGridSize)
  }, [ensure, trackId, initialGridSize])

  const mapSize = grid?.size ?? initialGridSize
  const cells = grid?.cells ?? []

  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const isLandscape = windowWidth > windowHeight
  const isWeb = Platform.OS === 'web'

  const cellPx = useMemo(() => {
    // Calculate max size: either windowWidth - 32, or 80% of height
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

  // Use hosted race logic instead of event track cars
  const {
    cars,
    start,
    stop,
    drivers: _raceDrivers,
    isFinished,
  } = useMyTeamRaceCars({
    raceId: activeRace?.config.id || 'preview',
    loop,
    width: mapSize,
    cellPx,
    gapPx: GRID_GAP,
    padPx: GRID_PAD,
    onFinished,
  })

  // Create driver names and numbers arrays for TrackLeaderboard
  // These map car.id (1-indexed) to driver info: driverNames[car.id - 1] = driver name
  const driverNames = useMemo(() => _raceDrivers.map((d) => d.driverName), [_raceDrivers])
  const driverNumbers = useMemo(() => _raceDrivers.map((d) => d.driverNumber), [_raceDrivers])

  const needsNewRaceRef = useRef(false)

  // Track lap progress - sample max lap from all cars
  const [maxLapCompleted, setMaxLapCompleted] = useState(0)
  const maxLaps = activeRace?.config?.laps ?? 3

  // Sample lap progress every 250ms
  useEffect(() => {
    if (!activeRace || activeRace.state !== 'running' || cars.length === 0) {
      setMaxLapCompleted(0)
      return
    }

    const interval = setInterval(() => {
      const maxLap = Math.max(0, ...cars.map((c) => Math.floor(c.laps.value || 0)))
      setMaxLapCompleted(maxLap)
    }, 250)

    return () => clearInterval(interval)
  }, [activeRace, activeRace?.state, cars])

  // Determine if we should show cars and run simulation
  useEffect(() => {
    const hasDrivers = driverIds.length > 0
    const isRunning = activeRace?.state === 'running'
    const raceFinished = activeRace?.state === 'finished' || isFinished

    // Show cars if we have drivers and race is running or just finished
    const shouldShow = hasDrivers && (isRunning || raceFinished)
    const shouldRun = hasDrivers && isRunning && !raceFinished

    setShowCarsVisual(shouldShow)
    setRunSim(shouldRun)

    // Entertainment value is fixed for hosted races (assume 50% capacity)
    setEntertainmentValue(0.5)

    if (shouldRun) needsNewRaceRef.current = true
  }, [driverIds.length, activeRace?.state, isFinished])

  // hard stop when not focused or not running sim
  useEffect(() => {
    if (!isFocused || !runSim) {
      stop()
    }
    return stop
  }, [isFocused, runSim, stop])

  // start only when focused + ready.
  // only call newRace once per event-start (using the ref).
  useEffect(() => {
    if (!isFocused || !runSim) return
    if (loop.length === 0) return
    if (cars.length === 0) return

    // For hosted races, cars are already seeded, so we just start
    start()
  }, [isFocused, runSim, loop.length, cars.length, start])

  const standSet = useMemo(() => {
    if (!cells.length) return new Set<number>()

    const emptyIdx: number[] = []
    for (let i = 0; i < cells.length; i++) if (cells[i] === 'empty') emptyIdx.push(i)
    if (emptyIdx.length === 0) return new Set<number>()

    // For hosted races, use 50% capacity
    const fill = 0.5
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
  }, [cells, trackId, mapSize])

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

  // Filter out finished cars from track display, but keep them for leaderboard
  const displayCarsOnTrack = useMemo(
    () => (driverIds.length > 0 ? cars.filter((c) => !c.finished.value) : []),
    [cars, driverIds.length],
  )
  const displayCars = driverIds.length > 0 ? cars : []

  // Format lap display
  const lapDisplay = useMemo(() => {
    return `Lap ${maxLapCompleted}/${maxLaps}`
  }, [maxLapCompleted, maxLaps])

  // Measure render time
  useEffect(() => {
    renderCount.current++
    renderStartTime.current = performance.now()
  })

  return (
    <SafeAreaView style={styles.safe} edges={isWeb ? ['top', 'left', 'right', 'bottom'] : []}>
      {/* Header with lap counter */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={28} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{isFinished ? 'Race Complete' : 'Racing...'}</Text>
        </View>
        <View style={styles.timerBox}>
          <Ionicons name="flag" size={20} color="#FFFFFF" />
          <Text style={styles.timerText}>{lapDisplay}</Text>
        </View>
      </View>

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
                  <CellCars
                    cars={displayCarsOnTrack}
                    carW={cellPx / 6}
                    carH={cellPx / 4}
                    leaderId={leaderId}
                  />
                ) : null}
              </View>
            </View>

            <View style={{ width: isLandscape ? 350 : wrapW, alignSelf: 'center' }}>
              <TrackLeaderboard
                cars={displayCars}
                height={leaderboardHeight}
                setLeaderId={setLeaderId}
                driverNames={driverNames}
                driverNumbers={driverNumbers}
              />
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
                  <CellCars
                    cars={displayCarsOnTrack}
                    carW={cellPx / 6}
                    carH={cellPx / 4}
                    leaderId={leaderId}
                  />
                ) : null}
              </View>
            </View>

            <View style={{ width: isLandscape ? 350 : wrapW, alignSelf: 'center' }}>
              <TrackLeaderboard
                cars={displayCars}
                height={470}
                setLeaderId={setLeaderId}
                driverNames={driverNames}
                driverNumbers={driverNumbers}
              />
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1f27',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timerText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },

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
