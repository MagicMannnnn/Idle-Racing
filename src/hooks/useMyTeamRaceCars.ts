import type { HostedRace, HostedRaceResultRow, RaceDriverSnapshot } from '@state/useMyTeamRaces'
import { calculatePrestigeAward, useMyTeamRaces } from '@state/useMyTeamRaces'
import { useTeam } from '@state/useTeam'
import { mulberry32, seedFromString } from '@utils/rng'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeMutable, type SharedValue } from 'react-native-reanimated'

type Dir = 'N' | 'E' | 'S' | 'W'

export type CarAnim = {
  id: number
  x: SharedValue<number>
  y: SharedValue<number>
  rotDeg: SharedValue<number>
  progress: SharedValue<number>
  laps: SharedValue<number>
  colorHex: string
}

type UseMyTeamRaceCarsOpts = {
  raceId: string
  loop: number[]
  width: number
  cellPx: number
  gapPx: number
  padPx: number
  carWFrac?: number
  carHFrac?: number
  carWPx?: number
  carHPx?: number
  onFinished?: (results: HostedRaceResultRow[]) => void
}

const dirToDeg = (d: Dir) => (d === 'N' ? 0 : d === 'E' ? 90 : d === 'S' ? 180 : 270)

function normAngleDeg(a: number) {
  let x = a % 360
  if (x < 0) x += 360
  return x
}
function shortestDeltaDeg(from: number, to: number) {
  return ((to - from + 540) % 360) - 180
}
function isCorner(a: Dir, b: Dir) {
  return (a === 'N' || a === 'S') !== (b === 'N' || b === 'S')
}

type V2 = { x: number; y: number }

function entryPoint(entryDir: Dir, out: V2) {
  switch (entryDir) {
    case 'E':
      out.x = -1
      out.y = 0
      break
    case 'W':
      out.x = 1
      out.y = 0
      break
    case 'S':
      out.x = 0
      out.y = -1
      break
    case 'N':
      out.x = 0
      out.y = 1
      break
  }
}
function exitPoint(exitDir: Dir, out: V2) {
  switch (exitDir) {
    case 'E':
      out.x = 1
      out.y = 0
      break
    case 'W':
      out.x = -1
      out.y = 0
      break
    case 'S':
      out.x = 0
      out.y = 1
      break
    case 'N':
      out.x = 0
      out.y = -1
      break
  }
}

const fixOrderBySwaps = (orderIdx: number[], sArr: number[]) => {
  let swapped = true
  for (let pass = 0; pass < 3 && swapped; pass++) {
    swapped = false
    for (let p = 0; p < orderIdx.length - 1; p++) {
      const a = orderIdx[p]
      const b = orderIdx[p + 1]
      if (sArr[a] > sArr[b]) {
        orderIdx[p] = b
        orderIdx[p + 1] = a
        swapped = true
      }
    }
  }
}

type OvertakePhase = 0 | 1 | 2 | 3

const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y

function rectAxes(rad: number): [V2, V2] {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    { x: c, y: s },
    { x: -s, y: c },
  ]
}

function projectOBB(center: V2, ax: V2, ay: V2, hx: number, hy: number, axis: V2) {
  const c = dot(center, axis)
  const r = Math.abs(dot(ax, axis)) * hx + Math.abs(dot(ay, axis)) * hy
  return { min: c - r, max: c + r }
}

function overlap1D(a: { min: number; max: number }, b: { min: number; max: number }) {
  return Math.min(a.max, b.max) - Math.max(a.min, b.min)
}

function mtvOBB(
  cA: V2,
  radA: number,
  hxA: number,
  hyA: number,
  cB: V2,
  radB: number,
  hxB: number,
  hyB: number,
) {
  const [axA, ayA] = rectAxes(radA)
  const [axB, ayB] = rectAxes(radB)

  const axes: V2[] = [axA, ayA, axB, ayB]

  let bestOverlap = Number.POSITIVE_INFINITY
  let bestAxisX = 0
  let bestAxisY = 0
  let hasBest = false

  for (const axis0 of axes) {
    let axisX = axis0.x
    let axisY = axis0.y
    const m = Math.hypot(axisX, axisY)
    if (m > 1e-9) {
      axisX /= m
      axisY /= m
    } else {
      axisX = 1
      axisY = 0
    }
    const axis = { x: axisX, y: axisY }

    const pA = projectOBB(cA, axA, ayA, hxA, hyA, axis)
    const pB = projectOBB(cB, axB, ayB, hxB, hyB, axis)

    const o = overlap1D(pA, pB)
    if (o <= 0) return null

    if (o < bestOverlap) {
      bestOverlap = o
      bestAxisX = axisX
      bestAxisY = axisY
      hasBest = true
    }
  }

  if (!hasBest) return null

  const dirX = cB.x - cA.x
  const dirY = cB.y - cA.y
  if (dirX * bestAxisX + dirY * bestAxisY < 0) {
    bestAxisX = -bestAxisX
    bestAxisY = -bestAxisY
  }

  return { x: bestAxisX * bestOverlap, y: bestAxisY * bestOverlap }
}

// ---------- your existing driver creation helpers (kept) ----------

function generateAIDrivers(
  rand: () => number,
  count: number,
  competitorMean: number,
  usedNumbers: Set<number>,
): RaceDriverSnapshot[] {
  const drivers: RaceDriverSnapshot[] = []
  const stdDev = 0.3

  for (let i = 0; i < count; i++) {
    const u1 = rand()
    const u2 = rand()
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    const rating = Math.max(0.5, Math.min(5.0, competitorMean + z0 * stdDev))

    let driverNumber = Math.floor(rand() * 99) + 1
    while (usedNumbers.has(driverNumber)) driverNumber = (driverNumber % 99) + 1
    usedNumbers.add(driverNumber)

    const variation = (rand() * 2 - 1) * 0.1 // fixed from seed

    drivers.push({
      driverId: `ai_${i + 1}`,
      driverName: `AI Driver`,
      driverNumber,
      driverRating: rating,
      carRating: rating,
      effectiveRating: rating,
      driverVariation: variation,
      isMyTeam: false,
    })
  }

  return drivers
}

function createRaceDrivers(race: HostedRace, rand: () => number): RaceDriverSnapshot[] {
  const teamState = useTeam.getState()
  const drivers: RaceDriverSnapshot[] = []
  const usedNumbers = new Set<number>()

  for (const driverId of race.config.driverIds) {
    const driver = teamState.drivers.find((d: any) => d.id === driverId)
    if (!driver) continue

    const carRating =
      teamState.upgrades.reduce((sum: number, u: any) => sum + u.value, 0) /
      Math.max(1, teamState.upgrades.length)

    const effectiveRating = (driver.rating + carRating) / 2

    const variation = (rand() * 2 - 1) * 0.1 // fixed from seed

    usedNumbers.add(driver.number)

    drivers.push({
      driverId: driver.id,
      driverName: driver.name,
      driverNumber: driver.number,
      driverRating: driver.rating,
      carRating,
      effectiveRating,
      driverVariation: variation,
      contractExpiresAt: driver.contractExpiresAt,
      isMyTeam: true,
    })
  }

  const aiCount = race.config.fieldSize - drivers.length
  if (aiCount > 0)
    drivers.push(...generateAIDrivers(rand, aiCount, race.config.competitorMean, usedNumbers))

  return drivers
}

// ---------- main hook ----------

export function useMyTeamRaceCars({
  raceId,
  loop,
  width,
  cellPx,
  gapPx,
  padPx,
  carWFrac = 1 / 6,
  carHFrac = 1 / 4,
  carWPx,
  carHPx,
  onFinished,
}: UseMyTeamRaceCarsOpts) {
  const getActiveRace = useMyTeamRaces((s: any) => s.getActiveRace)
  const finishRace = useMyTeamRaces((s: any) => s.finishRace)

  const race = getActiveRace()
  const len = loop.length
  const carCount = race?.config.fieldSize ?? 0

  const [cars, setCars] = useState<CarAnim[]>([])
  const [drivers, setDrivers] = useState<RaceDriverSnapshot[]>([])
  const [isFinished, setIsFinished] = useState(false)

  // --- these refs mirror useTrackCars ---
  const idsRef = useRef<number[]>([])
  const sRef = useRef<number[]>([])
  const vRef = useRef<number[]>([])
  const baseRef = useRef<number[]>([])
  const streakRef = useRef<number[]>([])

  const laneRef = useRef<number[]>([])
  const sideRef = useRef<number[]>([])
  const phaseRef = useRef<OvertakePhase[]>([])
  const holdRef = useRef<number[]>([])
  const overtakeTimeRef = useRef<number[]>([])

  const posXRef = useRef<number[]>([])
  const posYRef = useRef<number[]>([])
  const rotRef = useRef<number[]>([])

  const targetIdRef = useRef<number[][]>([])
  const beingOvertakenRef = useRef<number[]>([])

  const lapsRef = useRef<number[]>([])

  const runningRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const startAtTsRef = useRef<number | null>(null)

  const orderIdxRef = useRef<number[]>([])
  const posInOrderRef = useRef<Int32Array | null>(null)
  const idToIndexRef = useRef<Int32Array | null>(null)

  const gapAheadRef = useRef<Float32Array | null>(null)
  const desiredRef = useRef<Float32Array | null>(null)

  const targetPxRef = useRef<Float32Array | null>(null)
  const targetPyRef = useRef<Float32Array | null>(null)
  const rotDegArrRef = useRef<Float32Array | null>(null)
  const rotRadArrRef = useRef<Float32Array | null>(null)

  const pxRef = useRef<Float32Array | null>(null)
  const pyRef = useRef<Float32Array | null>(null)

  const publishAccumRef = useRef(0)
  const didLayoutRef = useRef(false)

  // Deterministic “race time” base. Prefer store timestamp if present; else snapshot once.
  const raceStartEpochRef = useRef<number | null>(null)

  // Small rating effect (requested): ~±5% across rating range.
  // You can tighten/loosen this without changing the rest of the sim.
  const RATING_SMALL_RANGE = 0.1 // total spread (e.g., 0.95..1.05 => 10% range)
  const ratingMulSmall = useCallback(
    (effRating: number) => {
      // effRating nominal range 0.5..5
      const t = Math.max(0, Math.min(1, (effRating - 0.5) / 4.5))
      const half = RATING_SMALL_RANGE / 2
      return 1 - half + t * RATING_SMALL_RANGE
    },
    [RATING_SMALL_RANGE],
  )

  const TUNE = useMemo(() => {
    return {
      baseSpeed: 3.2,
      // IMPORTANT: no random variance here for hosted races; per-driver variation is fixed from seed (driver.driverVariation).
      // This aligns with your "variation fixed" requirement.
      speedVariance: 0.0,

      accelRate: 3.5,
      accelOnStraights: 2.2,
      streakMax: 10,

      cornerMul: 0.42,
      preBrakeMul: 1,
      preBrakeWindow: 0.95,

      maxMul: 2.0,
      minMul: 0.8,

      gapStart: 0.42,
      passMargin: 1.0,
      minSpeedAdv: 0.2,
      overtakeBoost: 1.1,

      laneOffset: 0.4,
      laneEaseOut: 2.0,
      laneEaseBack: 1.0,
      laneHold: 0.0,

      alongsideGap: 0.0,
      lockWindow: 1.35,

      minLongGap: 0.38,
      laneSnap: 0.85,
      resolveIters: 3,

      followRate: 22.0,

      collideIters: 8,
      collideSlopPx: 0.75,
      maxPushPerIterPx: 3.5,
      tangentPushCapPx: 0.35,

      collideNeighbors: 3,

      packWindowFrac: 0.16,
      packJitter: 0.0,

      // Hosted race laps (finish at start of next lap)
      maxLap: (race?.config?.laps ?? 3) + 1,

      startWaitTime: 1.0,
      maxOvertakeTime: 12.0,

      insideCornerOvertakeMul: 0.92,

      slipstreamWindow: 0.55,
      slipstreamBoost: 1.04,
      slipstreamMinFrac: 0.2,

      publishHz: 30,
    }
  }, [race?.config?.laps])

  const computeDir = useCallback(
    (from: number, to: number): Dir => {
      const fr = Math.floor(from / width)
      const fc = from % width
      const tr = Math.floor(to / width)
      const tc = to % width
      if (tr < fr) return 'N'
      if (tr > fr) return 'S'
      if (tc > fc) return 'E'
      if (tc < fc) return 'W'
      return 'E'
    },
    [width],
  )

  const stop = useCallback(() => {
    runningRef.current = false
    lastTsRef.current = null
    startAtTsRef.current = null
    publishAccumRef.current = 0
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const getActiveTarget = (i: number) => {
    const list = targetIdRef.current[i]
    return list && list.length ? list[list.length - 1] : 0
  }

  const applyLayoutOnce = useCallback(() => {
    const ids = idsRef.current
    const sArr = sRef.current
    if (!cars.length || ids.length !== cars.length || len <= 0) return

    const stepPx = cellPx + gapPx
    const halfStep = stepPx / 2

    const idxToCenter = (gridIndex: number) => {
      const r = Math.floor(gridIndex / width)
      const c = gridIndex % width
      return {
        cx: padPx + c * stepPx + cellPx / 2,
        cy: padPx + r * stepPx + cellPx / 2,
      }
    }

    const s0: V2 = { x: 0, y: 0 }
    const e0: V2 = { x: 0, y: 0 }

    for (let i = 0; i < ids.length; i++) {
      const ns = ((sArr[i] % len) + len) % len
      const seg2 = Math.floor(ns)
      const localT = ns - seg2

      const curr2 = loop[seg2]
      const next2i = loop[(seg2 + 1) % len]
      const prev2i = loop[(seg2 - 1 + len) % len]

      const entryDir2 = computeDir(prev2i, curr2)
      const exitDir2 = computeDir(curr2, next2i)

      const entryDeg = dirToDeg(entryDir2)
      const exitDeg = dirToDeg(exitDir2)
      const rDeg = normAngleDeg(entryDeg + shortestDeltaDeg(entryDeg, exitDeg) * localT)
      const rotRad = (rDeg * Math.PI) / 180

      let dx = 0
      let dy = 0

      if (!isCorner(entryDir2, exitDir2)) {
        const straightOffset = -1 + 2 * localT
        if (exitDir2 === 'E') dx = straightOffset
        else if (exitDir2 === 'W') dx = -straightOffset
        else if (exitDir2 === 'S') dy = straightOffset
        else dy = -straightOffset
      } else {
        s0.x = 0
        s0.y = 0
        e0.x = 0
        e0.y = 0
        entryPoint(entryDir2, s0)
        exitPoint(exitDir2, e0)
        const cx0 = s0.x !== 0 ? s0.x : e0.x
        const cy0 = s0.y !== 0 ? s0.y : e0.y

        const a0 = Math.atan2(s0.y - cy0, s0.x - cx0)
        const a1 = Math.atan2(e0.y - cy0, e0.x - cx0)

        let da = a1 - a0
        if (da > Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI

        const a = a0 + da * localT
        dx = cx0 + Math.cos(a)
        dy = cy0 + Math.sin(a)
      }

      const laneAmt = laneRef.current[i] * TUNE.laneOffset
      const ox = Math.cos(rotRad) * laneAmt
      const oy = Math.sin(rotRad) * laneAmt

      const { cx, cy } = idxToCenter(curr2)
      const x = cx + (dx + ox) * halfStep
      const y = cy + (dy + oy) * halfStep

      posXRef.current[i] = x
      posYRef.current[i] = y
      rotRef.current[i] = rDeg

      const carAnim = cars[i]
      if (carAnim) {
        carAnim.x.value = x
        carAnim.y.value = y
        carAnim.rotDeg.value = rDeg
        const lp = lapsRef.current[i] ?? 0
        carAnim.laps.value = lp
        carAnim.progress.value = lp * len + ns
      }
    }
  }, [cars, cellPx, gapPx, padPx, width, len, loop, computeDir, TUNE.laneOffset])

  // Init / reset when race changes
  useEffect(() => {
    if (!race || race.config.id !== raceId || carCount <= 0 || len <= 0) {
      stop()
      setCars([])
      setDrivers([])
      setIsFinished(false)
      idsRef.current = []
      raceStartEpochRef.current = null
      return
    }

    stop()
    setIsFinished(false)

    // Determine deterministic “race start epoch”
    // Prefer store field if it exists; otherwise snapshot once now (but still deterministic for this client session).
    // If you have race.config.startedAt, use it.
    const startedAt = (race.config as any).startedAt as number | undefined
    raceStartEpochRef.current = startedAt ?? raceStartEpochRef.current ?? Date.now()

    const seed = seedFromString(race.config.seed)
    const rand = mulberry32(seed)

    const raceDrivers = createRaceDrivers(race, rand)
    setDrivers(raceDrivers)

    // Create car anims
    const created: CarAnim[] = []
    const colors = [
      '#FF5252',
      '#FF6E40',
      '#FFAB40',
      '#FFD740',
      '#EEFF41',
      '#69F0AE',
      '#40C4FF',
      '#448AFF',
      '#7C4DFF',
      '#E040FB',
    ]

    const ids: number[] = []
    for (let i = 0; i < carCount; i++) {
      const id = i + 1
      ids.push(id)
      created.push({
        id,
        x: makeMutable(0),
        y: makeMutable(0),
        rotDeg: makeMutable(0),
        progress: makeMutable(0),
        laps: makeMutable(0),
        colorHex: colors[i % colors.length],
      })
    }
    idsRef.current = ids

    // Allocate refs (mirrors useTrackCars)
    sRef.current = new Array(carCount).fill(0)
    vRef.current = new Array(carCount).fill(0)
    baseRef.current = new Array(carCount).fill(0)
    streakRef.current = new Array(carCount).fill(0)

    laneRef.current = new Array(carCount).fill(0)
    sideRef.current = new Array(carCount).fill(0)
    phaseRef.current = new Array(carCount).fill(0) as OvertakePhase[]
    holdRef.current = new Array(carCount).fill(0)
    overtakeTimeRef.current = new Array(carCount).fill(0)

    posXRef.current = new Array(carCount).fill(0)
    posYRef.current = new Array(carCount).fill(0)
    rotRef.current = new Array(carCount).fill(0)

    targetIdRef.current = new Array(carCount).fill(0).map(() => [])
    beingOvertakenRef.current = new Array(carCount).fill(0)

    lapsRef.current = new Array(carCount).fill(0)

    orderIdxRef.current = new Array(carCount)
    for (let i = 0; i < carCount; i++) orderIdxRef.current[i] = i
    // initial sort once (by s, but s is seeded below)
    posInOrderRef.current = new Int32Array(carCount)

    idToIndexRef.current = new Int32Array(carCount + 1)
    for (let i = 0; i < carCount + 1; i++) idToIndexRef.current[i] = -1

    gapAheadRef.current = new Float32Array(carCount)
    desiredRef.current = new Float32Array(carCount)

    targetPxRef.current = new Float32Array(carCount)
    targetPyRef.current = new Float32Array(carCount)
    rotDegArrRef.current = new Float32Array(carCount)
    rotRadArrRef.current = new Float32Array(carCount)

    pxRef.current = new Float32Array(carCount)
    pyRef.current = new Float32Array(carCount)

    // Seed starting grid with random order (deterministic from seed)
    const packLen = Math.max(1, len * TUNE.packWindowFrac)
    const spacing = carCount > 1 ? packLen / (carCount - 1) : 0
    const anchor = len - 1e-3

    // Fisher-Yates shuffle with seeded RNG for deterministic random grid order
    const orderedIndices = Array.from({ length: carCount }, (_, i) => i)
    for (let i = orderedIndices.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[orderedIndices[i], orderedIndices[j]] = [orderedIndices[j], orderedIndices[i]]
    }

    for (let posIdx = 0; posIdx < carCount; posIdx++) {
      const i = orderedIndices[posIdx]
      const d = raceDrivers[i]
      const variationMul = 1 + (d?.driverVariation ?? 0) // fixed per race seed
      const ratingMul = ratingMulSmall(d?.effectiveRating ?? 2.5) // small rating impact

      const base = TUNE.baseSpeed * variationMul * ratingMul

      const s0 = (anchor - posIdx * spacing + len) % len
      sRef.current[i] = s0
      vRef.current[i] = base
      baseRef.current[i] = base
      streakRef.current[i] = 0

      laneRef.current[i] = 0
      sideRef.current[i] = 0
      phaseRef.current[i] = 0
      holdRef.current[i] = 0
      overtakeTimeRef.current[i] = 0

      posXRef.current[i] = 0
      posYRef.current[i] = 0
      rotRef.current[i] = 0

      targetIdRef.current[i] = []
      beingOvertakenRef.current[i] = 0

      lapsRef.current[i] = 0

      created[i].laps.value = 0
      created[i].progress.value = s0
    }

    // Sort orderIdx by initial s
    orderIdxRef.current.sort((a, b) => sRef.current[a] - sRef.current[b])

    didLayoutRef.current = false
    setCars(created)
  }, [race, raceId, carCount, len, stop, TUNE.baseSpeed, TUNE.packWindowFrac, ratingMulSmall])

  const start = useCallback(() => {
    if (runningRef.current) return
    if (!race || race.config.id !== raceId) return
    if (len === 0 || carCount === 0) return
    if (cars.length !== carCount || idsRef.current.length !== carCount) return

    const gapAheadByI = gapAheadRef.current
    const desired = desiredRef.current
    const targetPx = targetPxRef.current
    const targetPy = targetPyRef.current
    const rotDegArr = rotDegArrRef.current
    const rotRadArr = rotRadArrRef.current
    const px = pxRef.current
    const py = pyRef.current
    const orderIdx = orderIdxRef.current
    const posInOrder = posInOrderRef.current
    const idToIndex = idToIndexRef.current

    if (
      !gapAheadByI ||
      !desired ||
      !targetPx ||
      !targetPy ||
      !rotDegArr ||
      !rotRadArr ||
      !px ||
      !py ||
      !posInOrder ||
      !idToIndex ||
      orderIdx.length !== carCount
    ) {
      return
    }

    runningRef.current = true
    lastTsRef.current = null
    startAtTsRef.current = null
    publishAccumRef.current = 0

    applyLayoutOnce()

    const stepPx = cellPx + gapPx
    const halfStep = stepPx / 2

    const carW = Math.max(1, carWPx ?? cellPx * carWFrac)
    const carH = Math.max(1, carHPx ?? cellPx * carHFrac)
    const halfW = carW / 2
    const halfH = carH / 2

    const idxToCenter = (gridIndex: number) => {
      const r = Math.floor(gridIndex / width)
      const c = gridIndex % width
      return {
        cx: padPx + c * stepPx + cellPx / 2,
        cy: padPx + r * stepPx + cellPx / 2,
      }
    }

    const iterateNeighborPairsUnique = (
      n: number,
      K: number,
      cb: (i: number, j: number) => void,
    ) => {
      const k = Math.max(0, Math.min(K, n - 1))
      if (k === 0 || n <= 1) return
      for (let p = 0; p < n; p++) {
        const a = orderIdx[p]
        for (let off = 1; off <= k; off++) {
          const q = (p + off) % n
          const b = orderIdx[q]
          if (a < b) cb(a, b)
          else cb(b, a)
        }
      }
    }

    const s0: V2 = { x: 0, y: 0 }
    const e0: V2 = { x: 0, y: 0 }

    // deterministic “race now” uses raceStartEpochRef + elapsed since startAtTs
    const getRaceNowEpochMs = (ts: number) => {
      const startEpoch = raceStartEpochRef.current ?? Date.now()
      const startAt = startAtTsRef.current ?? ts
      const elapsed = Math.max(0, ts - startAt)
      return startEpoch + elapsed
    }

    const tick = (ts: number) => {
      if (!runningRef.current) return

      if (startAtTsRef.current == null) {
        startAtTsRef.current = didLayoutRef.current
          ? ts
          : ts + Math.max(0, TUNE.startWaitTime) * 1000
        lastTsRef.current = ts
        didLayoutRef.current = true
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      if (ts < startAtTsRef.current) {
        if (!didLayoutRef.current) {
          applyLayoutOnce()
          didLayoutRef.current = true
        }
        lastTsRef.current = ts
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const last = lastTsRef.current
      lastTsRef.current = ts
      const dt = last == null ? 0 : Math.min(0.033, Math.max(0, (ts - last) / 1000))
      if (dt <= 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const ids = idsRef.current
      const sArr = sRef.current
      const vArr = vRef.current
      const baseArr = baseRef.current
      const streakArr = streakRef.current

      const laneArr = laneRef.current
      const sideArr = sideRef.current
      const phaseArr = phaseRef.current
      const holdArr = holdRef.current
      const otArr = overtakeTimeRef.current

      for (let i = 0; i < idToIndex.length; i++) idToIndex[i] = -1
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        if (id >= 0 && id < idToIndex.length) idToIndex[id] = i
      }

      // overtake timeout tracking (same as useTrackCars)
      for (let i = 0; i < ids.length; i++) {
        if (phaseArr[i] === 1 || phaseArr[i] === 2 || phaseArr[i] === 3) {
          otArr[i] = (otArr[i] ?? 0) + dt
          if (otArr[i] > TUNE.maxOvertakeTime) {
            holdArr[i] = 0
            phaseArr[i] = 3
            targetIdRef.current[i] = []
          }
        } else {
          otArr[i] = 0
        }
      }

      // stable order update
      fixOrderBySwaps(orderIdx, sArr)
      for (let p = 0; p < orderIdx.length; p++) posInOrder[orderIdx[p]] = p

      for (let p = 0; p < orderIdx.length; p++) {
        const curI = orderIdx[p]
        const aheadI = orderIdx[(p + 1) % orderIdx.length]
        gapAheadByI[curI] = (sArr[aheadI] - sArr[curI] + len) % len
      }

      const getNextAhead = (i: number) => {
        const p = posInOrder[i]
        const ai = orderIdx[(p + 1) % orderIdx.length]
        return { i: ai, id: ids[ai], s: sArr[ai], v: vArr[ai] }
      }

      beingOvertakenRef.current.fill(0)
      for (let i = 0; i < ids.length; i++) {
        const tgt = getActiveTarget(i)
        if (tgt && phaseArr[i] !== 0) {
          const ti = tgt >= 0 && tgt < idToIndex.length ? idToIndex[tgt] : -1
          if (ti >= 0) beingOvertakenRef.current[ti] = 1
        }
      }

      const isOvertaking = (i: number) => phaseArr[i] !== 0
      const isBeingOvertaken = (i: number) => beingOvertakenRef.current[i] === 1
      const isLocked = (i: number) => isOvertaking(i) || isBeingOvertaken(i)

      const leaderHasActivePass = (leaderId: number, leaderS: number) => {
        for (let j = 0; j < ids.length; j++) {
          const list = targetIdRef.current[j]
          const active = list && list.length ? list[list.length - 1] : 0
          if (active !== leaderId) continue
          if (phaseArr[j] === 0) continue
          const g = (leaderS - sArr[j] + len) % len
          if (g < TUNE.lockWindow) return true
        }
        return false
      }

      const pickSideForLeader = (leaderId: number, preferred: number) => {
        let leftUsed = false
        let rightUsed = false
        for (let j = 0; j < ids.length; j++) {
          const list = targetIdRef.current[j]
          const active = list && list.length ? list[list.length - 1] : 0
          if (active !== leaderId) continue
          if (phaseArr[j] === 0) continue
          const sgn = sideArr[j]
          if (sgn < 0) leftUsed = true
          if (sgn > 0) rightUsed = true
        }

        if (preferred < 0 && !leftUsed) return -1
        if (preferred > 0 && !rightUsed) return 1
        if (!leftUsed) return -1
        if (!rightUsed) return 1
        return 0
      }

      // start overtake attempts (same as useTrackCars)
      for (let k = 0; k < orderIdx.length; k++) {
        const leaderI = orderIdx[k]
        const followerI = orderIdx[(k - 1 + orderIdx.length) % orderIdx.length]
        const gapBehind = (sArr[leaderI] - sArr[followerI] + len) % len
        const speedAdv = vArr[followerI] - vArr[leaderI]
        const fi = followerI

        if (phaseArr[fi] !== 0) continue
        if (isLocked(fi) || isLocked(leaderI)) continue
        if (leaderHasActivePass(ids[leaderI], sArr[leaderI])) continue

        if (gapBehind < TUNE.gapStart && speedAdv > TUNE.minSpeedAdv) {
          const preferred = ids[fi] < ids[leaderI] ? -1 : 1
          const side = pickSideForLeader(ids[leaderI], preferred)
          if (side === 0) continue

          sideArr[fi] = side
          phaseArr[fi] = 1
          targetIdRef.current[fi] = [ids[leaderI]]
          beingOvertakenRef.current[leaderI] = 1
          otArr[fi] = 0
        }
      }

      // contract expiry: deterministic check against race-time
      const raceNow = getRaceNowEpochMs(ts)

      for (let i = 0; i < sArr.length; i++) {
        const s = ((sArr[i] % len) + len) % len
        const seg = Math.floor(s)
        const frac = s - seg

        const curr = loop[seg]
        const next = loop[(seg + 1) % len]
        const prev = loop[(seg - 1 + len) % len]
        const next2 = loop[(seg + 2) % len]

        const entryDir = computeDir(prev, curr)
        const exitDir = computeDir(curr, next)
        const nextExit = computeDir(next, next2)

        const cornerNow = isCorner(entryDir, exitDir)
        const cornerNext = isCorner(exitDir, nextExit)

        let streak = streakArr[i]
        if (cornerNow) streak = 0
        else if (frac > 0.85) streak = Math.min(TUNE.streakMax, streak + 1)
        streakArr[i] = streak
        const streakFactor = streak / TUNE.streakMax

        const entryDeg = dirToDeg(entryDir)
        const exitDeg = dirToDeg(exitDir)
        const turnDelta = shortestDeltaDeg(entryDeg, exitDeg)
        const turnDir = turnDelta > 0 ? 1 : turnDelta < 0 ? -1 : 0

        const overtakingNow = phaseArr[i] === 1 || phaseArr[i] === 2
        const insideOvertakeCorner =
          cornerNow &&
          overtakingNow &&
          turnDir !== 0 &&
          sideArr[i] !== 0 &&
          (turnDir > 0 ? sideArr[i] > 0 : sideArr[i] < 0) &&
          Math.abs(laneArr[i]) > 0.25

        const slipstream =
          !cornerNow &&
          !cornerNext &&
          frac > TUNE.slipstreamMinFrac &&
          gapAheadByI[i] < TUNE.slipstreamWindow &&
          !overtakingNow

        // base target speed
        let target = baseArr[i]
        target *= 1 + (TUNE.accelOnStraights - 1) * streakFactor
        if (cornerNow) target *= TUNE.cornerMul
        if (!cornerNow && cornerNext && frac > TUNE.preBrakeWindow) target *= TUNE.preBrakeMul
        if (overtakingNow) target *= TUNE.overtakeBoost
        if (insideOvertakeCorner) target *= TUNE.insideCornerOvertakeMul
        if (slipstream) target *= TUNE.slipstreamBoost

        // Contract expiry behavior (deterministic):
        // If a MY TEAM driver expires mid-race, apply penalty to target (doesn't break sim).
        const d = drivers[i]
        if (d?.isMyTeam && d.contractExpiresAt && raceNow > d.contractExpiresAt) {
          target *= 0.5
        }

        const maxV = baseArr[i] * TUNE.maxMul
        const minV = baseArr[i] * TUNE.minMul
        if (target > maxV) target = maxV
        if (target < minV) target = minV

        const v = vArr[i] + (target - vArr[i]) * (1 - Math.exp(-TUNE.accelRate * dt))
        vArr[i] = v

        const prevS = sArr[i]
        let ns = sArr[i] + v * dt

        if (len > 0) {
          if (ns >= len) {
            const wraps = Math.floor(ns / len)
            lapsRef.current[i] = Math.min(TUNE.maxLap, (lapsRef.current[i] ?? 0) + wraps)
            ns = ns % len
          } else if (ns < 0) {
            ns = ((ns % len) + len) % len
          } else {
            if (prevS > ns && prevS - ns > len * 0.5) {
              lapsRef.current[i] = Math.min(TUNE.maxLap, (lapsRef.current[i] ?? 0) + 1)
            }
          }
        }

        ns %= len
        if (ns < 0) ns += len
        sArr[i] = ns

        const carAnim = cars[i]
        if (carAnim) {
          const lp = lapsRef.current[i] ?? 0
          carAnim.laps.value = lp
          carAnim.progress.value = lp * len + ns
        }

        // overtake state machine (same as useTrackCars)
        if (phaseArr[i] !== 0) {
          const activeTargetId = getActiveTarget(i)
          const ahead = getNextAhead(i)
          const gapAhead = (ahead.s - sArr[i] + len) % len

          let stillAlongside = false
          if (activeTargetId) {
            const ti =
              activeTargetId >= 0 && activeTargetId < idToIndex.length
                ? idToIndex[activeTargetId]
                : -1
            if (ti >= 0) {
              const behindTarget = (sArr[ti] - sArr[i] + len) % len
              stillAlongside = behindTarget < TUNE.alongsideGap
            }
          }

          const tryChainTarget = () => {
            if (!ahead) return false
            if (ahead.id === ids[i]) return false
            const list = targetIdRef.current[i]
            if (list.includes(ahead.id)) return false

            if (gapAhead < TUNE.gapStart) {
              list.push(ahead.id)
              phaseArr[i] = 2
              holdArr[i] = Math.max(holdArr[i], TUNE.laneHold)
              return true
            }
            return false
          }

          if (phaseArr[i] === 1) {
            if (Math.abs(laneArr[i] - sideArr[i]) > 0.9) phaseArr[i] = 2
          } else if (phaseArr[i] === 2) {
            const wouldReturn = !stillAlongside && gapAhead > 0.25 + TUNE.gapStart + TUNE.passMargin
            if (wouldReturn) {
              const chained = tryChainTarget()
              if (!chained) {
                holdArr[i] = TUNE.laneHold
                phaseArr[i] = 3
              }
            }
          } else if (phaseArr[i] === 3) {
            if (!stillAlongside) holdArr[i] = Math.max(0, holdArr[i] - dt)
            else holdArr[i] = Math.max(holdArr[i], 0.1)

            if (!stillAlongside && holdArr[i] <= 0 && Math.abs(laneArr[i]) < 0.05) {
              phaseArr[i] = 0
              sideArr[i] = 0
              targetIdRef.current[i] = []
              otArr[i] = 0
            }
          }
        }
      }

      // desired lane
      for (let i = 0; i < ids.length; i++) {
        desired[i] = phaseArr[i] === 1 || phaseArr[i] === 2 ? sideArr[i] : 0
      }

      const snapLane = (x: number) => (x <= -0.5 ? -1 : x >= 0.5 ? 1 : 0)

      const canTakeLane = (i: number, L: number) => {
        const p = posInOrder[i]
        const aheadI = orderIdx[(p + 1) % orderIdx.length]
        const behindI = orderIdx[(p - 1 + orderIdx.length) % orderIdx.length]

        const gAhead = (sArr[aheadI] - sArr[i] + len) % len
        const gBehind = (sArr[i] - sArr[behindI] + len) % len

        if (gAhead < TUNE.minLongGap && snapLane(desired[aheadI]) === L) return false
        if (gBehind < TUNE.minLongGap && snapLane(desired[behindI]) === L) return false
        return true
      }

      // resolve lane conflicts
      for (let iter = 0; iter < TUNE.resolveIters; iter++) {
        for (let k = 0; k < orderIdx.length; k++) {
          const leaderI = orderIdx[k]
          const followerI = orderIdx[(k - 1 + orderIdx.length) % orderIdx.length]

          const gap = (sArr[leaderI] - sArr[followerI] + len) % len
          if (gap >= TUNE.minLongGap) continue

          const fLane = snapLane(desired[followerI])
          const lLane = snapLane(desired[leaderI])
          if (fLane !== lLane) continue

          const fOver = phaseArr[followerI] === 1 || phaseArr[followerI] === 2
          const lOver = phaseArr[leaderI] === 1 || phaseArr[leaderI] === 2

          const firstYield = !fOver && lOver ? followerI : !lOver && fOver ? leaderI : followerI
          const secondYield = firstYield === followerI ? leaderI : followerI

          const tryMove = (idx: number) => {
            const cur = snapLane(desired[idx])
            const options = cur === 0 ? [-1, 1] : [0, -cur]
            for (const L of options) {
              if (canTakeLane(idx, L)) {
                desired[idx] = desired[idx] + (L - desired[idx]) * TUNE.laneSnap
                return true
              }
            }
            return false
          }

          if (!tryMove(firstYield)) tryMove(secondYield)
        }
      }

      // lane ease
      for (let i = 0; i < ids.length; i++) {
        const targetLane = snapLane(desired[i])
        const ease = targetLane === 0 ? TUNE.laneEaseBack : TUNE.laneEaseOut
        laneArr[i] = laneArr[i] + (targetLane - laneArr[i]) * (1 - Math.exp(-ease * dt))
      }

      // target positions
      for (let i = 0; i < sArr.length; i++) {
        const ns = ((sArr[i] % len) + len) % len
        const seg2 = Math.floor(ns)
        const localT = ns - seg2

        const curr2 = loop[seg2]
        const next2i = loop[(seg2 + 1) % len]
        const prev2i = loop[(seg2 - 1 + len) % len]

        const entryDir2 = computeDir(prev2i, curr2)
        const exitDir2 = computeDir(curr2, next2i)

        const entryDeg = dirToDeg(entryDir2)
        const exitDeg = dirToDeg(exitDir2)
        const rDeg = normAngleDeg(entryDeg + shortestDeltaDeg(entryDeg, exitDeg) * localT)
        rotDegArr[i] = rDeg
        rotRadArr[i] = (rDeg * Math.PI) / 180

        let dx = 0
        let dy = 0

        if (!isCorner(entryDir2, exitDir2)) {
          const straightOffset = -1 + 2 * localT
          if (exitDir2 === 'E') dx = straightOffset
          else if (exitDir2 === 'W') dx = -straightOffset
          else if (exitDir2 === 'S') dy = straightOffset
          else dy = -straightOffset
        } else {
          s0.x = 0
          s0.y = 0
          e0.x = 0
          e0.y = 0
          entryPoint(entryDir2, s0)
          exitPoint(exitDir2, e0)
          const cx0 = s0.x !== 0 ? s0.x : e0.x
          const cy0 = s0.y !== 0 ? s0.y : e0.y

          const a0 = Math.atan2(s0.y - cy0, s0.x - cx0)
          const a1 = Math.atan2(e0.y - cy0, e0.x - cx0)

          let da = a1 - a0
          if (da > Math.PI) da -= 2 * Math.PI
          if (da < -Math.PI) da += 2 * Math.PI

          const a = a0 + da * localT
          dx = cx0 + Math.cos(a)
          dy = cy0 + Math.sin(a)
        }

        const laneAmt = laneArr[i] * TUNE.laneOffset
        const ox = Math.cos(rotRadArr[i]) * laneAmt
        const oy = Math.sin(rotRadArr[i]) * laneAmt

        const { cx, cy } = idxToCenter(curr2)
        targetPx[i] = cx + (dx + ox) * halfStep
        targetPy[i] = cy + (dy + oy) * halfStep
      }

      const followAlpha = 1 - Math.exp(-TUNE.followRate * dt)

      for (let i = 0; i < ids.length; i++) {
        if (posXRef.current[i] === 0 && posYRef.current[i] === 0) {
          posXRef.current[i] = targetPx[i]
          posYRef.current[i] = targetPy[i]
        }

        const curX = posXRef.current[i] ?? targetPx[i]
        const curY = posYRef.current[i] ?? targetPy[i]
        px[i] = curX + (targetPx[i] - curX) * followAlpha
        py[i] = curY + (targetPy[i] - curY) * followAlpha
      }

      // collisions (same as useTrackCars)
      const slop = TUNE.collideSlopPx
      const hx = halfW + slop
      const hy = halfH + slop

      iterateNeighborPairsUnique(ids.length, TUNE.collideNeighbors, (i, j) => {
        if (Math.abs(px[i] - px[j]) < 1e-6 && Math.abs(py[i] - py[j]) < 1e-6) {
          const n = (ids[i] * 1103515245 + ids[j] * 12345) >>> 0
          const ang = ((n % 360) * Math.PI) / 180
          px[j] += Math.cos(ang) * 0.25
          py[j] += Math.sin(ang) * 0.25
        }
      })

      for (let iter = 0; iter < TUNE.collideIters; iter++) {
        let any = false

        iterateNeighborPairsUnique(ids.length, TUNE.collideNeighbors, (i, j) => {
          const dx = px[j] - px[i]
          const dy = py[j] - py[i]

          const rr = Math.max(hx, hy) * 2.0
          if (dx * dx + dy * dy > rr * rr) return

          const mtv = mtvOBB(
            { x: px[i], y: py[i] },
            rotRadArr[i],
            hx,
            hy,
            { x: px[j], y: py[j] },
            rotRadArr[j],
            hx,
            hy,
          )
          if (!mtv) return
          any = true

          const h0x = Math.cos(rotRadArr[i])
          const h0y = Math.sin(rotRadArr[i])
          const h1x = Math.cos(rotRadArr[j])
          const h1y = Math.sin(rotRadArr[j])

          let tanX = h0x + h1x
          let tanY = h0y + h1y
          let tanM = Math.hypot(tanX, tanY)

          if (!Number.isFinite(tanX) || !Number.isFinite(tanY) || tanM < 1e-6) {
            tanM = Math.hypot(dx, dy)
            if (tanM > 1e-9) {
              tanX = dx / tanM
              tanY = dy / tanM
            } else {
              tanX = 1
              tanY = 0
            }
          } else {
            tanX /= tanM
            tanY /= tanM
          }

          const norX = -tanY
          const norY = tanX

          const mtvN = mtv.x * norX + mtv.y * norY
          const mtvT = mtv.x * tanX + mtv.y * tanY

          let pushX =
            norX * mtvN +
            tanX * Math.max(-TUNE.tangentPushCapPx, Math.min(TUNE.tangentPushCapPx, mtvT))
          let pushY =
            norY * mtvN +
            tanY * Math.max(-TUNE.tangentPushCapPx, Math.min(TUNE.tangentPushCapPx, mtvT))

          pushX *= 0.5
          pushY *= 0.5

          const m = Math.hypot(pushX, pushY)
          if (m > TUNE.maxPushPerIterPx) {
            const s = TUNE.maxPushPerIterPx / m
            pushX *= s
            pushY *= s
          }

          const bias = ids[i] < ids[j] ? -0.02 : 0.02
          px[i] -= pushX + norX * bias
          py[i] -= pushY + norY * bias
          px[j] += pushX + norX * bias
          py[j] += pushY + norY * bias
        })

        if (!any) break
      }

      for (let i = 0; i < ids.length; i++) {
        posXRef.current[i] = px[i]
        posYRef.current[i] = py[i]
        rotRef.current[i] = rotDegArr[i]
      }

      // publish throttle
      publishAccumRef.current += dt
      const publishEvery = 1 / Math.max(1, TUNE.publishHz)
      const doPublish = publishAccumRef.current >= publishEvery
      if (doPublish) publishAccumRef.current = 0

      if (doPublish) {
        for (let i = 0; i < sArr.length; i++) {
          const carAnim = cars[i]
          if (carAnim) {
            carAnim.x.value = posXRef.current[i]
            carAnim.y.value = posYRef.current[i]
            carAnim.rotDeg.value = rotRef.current[i]
          }
        }
      }

      // finish condition: any car hits maxLap (same pattern as your broken version, but based on lapsRef like useTrackCars)
      let raceFinished = false
      for (let i = 0; i < ids.length; i++) {
        if ((lapsRef.current[i] ?? 0) >= TUNE.maxLap) {
          raceFinished = true
          break
        }
      }

      if (raceFinished && !isFinished) {
        setIsFinished(true)

        const results: HostedRaceResultRow[] = drivers.map((driver, i) => {
          const lp = lapsRef.current[i] ?? 0
          const prog = lp * len + (((sArr[i] % len) + len) % len)
          return {
            driverId: driver.driverId,
            driverName: driver.driverName,
            driverNumber: driver.driverNumber,
            position: 0,
            laps: lp,
            finalProgress: prog,
            isMyTeam: driver.isMyTeam,
          }
        })

        results.sort((a, b) => b.finalProgress - a.finalProgress)

        const competitorMean = race.config.competitorMean ?? 2.0
        const fieldSize = race.config.fieldSize ?? carCount

        results.forEach((r, idx) => {
          r.position = idx + 1
          if (r.isMyTeam) {
            const prestige = calculatePrestigeAward(r.position, competitorMean, fieldSize)
            if (prestige > 0) r.prestigeAwarded = prestige
          }
        })

        finishRace(results)
        onFinished?.(results)
        stop()
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [
    race,
    raceId,
    len,
    carCount,
    cars,
    drivers,
    cellPx,
    gapPx,
    padPx,
    width,
    carWFrac,
    carHFrac,
    carWPx,
    carHPx,
    computeDir,
    applyLayoutOnce,
    finishRace,
    onFinished,
    stop,
    TUNE,
    isFinished,
  ])

  useEffect(() => stop, [stop])

  return { cars, drivers, start, stop, isFinished }
}
