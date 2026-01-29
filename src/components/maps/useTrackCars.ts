import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeMutable, type SharedValue } from 'react-native-reanimated'

type Dir = 'N' | 'E' | 'S' | 'W'

export type CarAnim = {
  id: number
  x: SharedValue<number>
  y: SharedValue<number>
  rotDeg: SharedValue<number>

  // ✅ Leaderboard signals
  progress: SharedValue<number> // total progress in "track steps" (lap*len + s)
  laps: SharedValue<number>
}

type UseTrackCarsOpts = {
  loop: number[]
  width: number
  carCount?: number
  cellPx: number
  gapPx: number
  padPx: number

  carWFrac?: number
  carHFrac?: number
  carWPx?: number
  carHPx?: number
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

function entryPoint(entryDir: Dir) {
  switch (entryDir) {
    case 'E':
      return { x: -1, y: 0 }
    case 'W':
      return { x: 1, y: 0 }
    case 'S':
      return { x: 0, y: -1 }
    case 'N':
      return { x: 0, y: 1 }
  }
}
function exitPoint(exitDir: Dir) {
  switch (exitDir) {
    case 'E':
      return { x: 1, y: 0 }
    case 'W':
      return { x: -1, y: 0 }
    case 'S':
      return { x: 0, y: 1 }
    case 'N':
      return { x: 0, y: -1 }
  }
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type OvertakePhase = 0 | 1 | 2 | 3 // 0 none, 1 out, 2 hold, 3 back

// =========================
// Collision helpers (OBB)
// =========================
type V2 = { x: number; y: number }
const dot = (a: V2, b: V2) => a.x * b.x + a.y * b.y
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s })
const normalize = (a: V2): V2 => {
  const m = Math.hypot(a.x, a.y)
  if (m < 1e-9) return { x: 1, y: 0 }
  return { x: a.x / m, y: a.y / m }
}

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
  let bestAxis: V2 | null = null

  for (const axis0 of axes) {
    const axis = normalize(axis0)
    const pA = projectOBB(cA, axA, ayA, hxA, hyA, axis)
    const pB = projectOBB(cB, axB, ayB, hxB, hyB, axis)

    const o = overlap1D(pA, pB)
    if (o <= 0) return null

    if (o < bestOverlap) {
      bestOverlap = o
      bestAxis = axis
    }
  }

  if (!bestAxis) return null

  const dir = sub(cB, cA)
  if (dot(dir, bestAxis) < 0) bestAxis = mul(bestAxis, -1)

  return mul(bestAxis, bestOverlap)
}

export function useTrackCars({
  loop,
  width,
  carCount = 5,
  cellPx,
  gapPx,
  padPx,
  carWFrac = 1 / 6,
  carHFrac = 1 / 4,
  carWPx,
  carHPx,
}: UseTrackCarsOpts) {
  const len = loop.length
  const safeCarCount = Math.min(carCount, len)

  const TUNE = useMemo(() => {
    return {
      baseSpeed: 3.2,
      speedVariance: 0.12,

      accelRate: 3.5,
      accelOnStraights: 1.6,
      streakMax: 10,

      cornerMul: 0.42,
      preBrakeMul: 0.7,
      preBrakeWindow: 0.35,

      maxMul: 2.0,
      minMul: 0.8,

      // Overtakes
      gapStart: 0.42,
      passMargin: 1.0,
      minSpeedAdv: 0.2,
      overtakeBoost: 1.1,

      laneOffset: 0.4,
      laneEaseOut: 2.0,
      laneEaseBack: 1.0,
      laneHold: 0.0,

      // multi-overtake safety
      alongsideGap: 0.0,
      lockWindow: 1.35,

      // Collision avoidance (s/lane space)
      minLongGap: 0.38,
      laneSnap: 0.85,
      resolveIters: 3,

      // Pixel-space smoothing + collision
      followRate: 18.0,
      collideIters: 8,
      collideSlopPx: 0.75,
      maxPushPerIterPx: 3.5,
      tangentPushCapPx: 0.35,

      // Spawn as a close pack
      packWindowFrac: 0.16,
      packJitter: 0.06,

      // ✅ leaderboard safety
      maxLap: 9999,
    }
  }, [])

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

  // ----- shared-value cars (created once per “signature”) -----
  const [cars, setCars] = useState<CarAnim[]>([])
  const nextIdRef = useRef(1)

  // ----- sim state (refs) -----
  const idsRef = useRef<number[]>([])
  const sRef = useRef<number[]>([])
  const vRef = useRef<number[]>([])
  const baseRef = useRef<number[]>([])
  const streakRef = useRef<number[]>([])

  const laneRef = useRef<number[]>([])
  const sideRef = useRef<number[]>([])
  const phaseRef = useRef<OvertakePhase[]>([])
  const holdRef = useRef<number[]>([])

  const posXRef = useRef<number[]>([])
  const posYRef = useRef<number[]>([])
  const rotRef = useRef<number[]>([])

  const targetIdRef = useRef<number[][]>([])
  const beingOvertakenRef = useRef<number[]>([])

  // ✅ leaderboards
  const lapsRef = useRef<number[]>([])

  const runningRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  // --- IMPORTANT: avoid update-depth loops by isolating ALL setCars() here ---
  const sigRef = useRef<string>('')

  const trackSig = useMemo(() => {
    return `${width}|${cellPx}|${gapPx}|${padPx}|${safeCarCount}|${loop.join(',')}`
  }, [width, cellPx, gapPx, padPx, safeCarCount, loop])

  const stop = useCallback(() => {
    runningRef.current = false
    lastTsRef.current = null
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // NO setState here. Pure pause.
  }, [])

  const getActiveTarget = (i: number) => {
    const list = targetIdRef.current[i]
    return list && list.length ? list[list.length - 1] : 0
  }

  // Internal helper: resets ref arrays for a “new race” (no setCars)
  const seedNewRaceRefs = useCallback(() => {
    const ids = idsRef.current
    if (ids.length !== safeCarCount || safeCarCount === 0 || len === 0) return

    const rand = mulberry32(Date.now())

    const packLen = Math.max(1, len * TUNE.packWindowFrac)
    const spacing = safeCarCount > 1 ? packLen / (safeCarCount - 1) : 0
    const anchor = 0

    for (let i = 0; i < safeCarCount; i++) {
      const variance = 1 + (rand() * 2 - 1) * TUNE.speedVariance
      const base = TUNE.baseSpeed * variance

      const jitter = (rand() * 2 - 1) * TUNE.packJitter
      const s0 = (anchor - i * spacing + jitter + len * 10) % len

      sRef.current[i] = s0
      vRef.current[i] = base
      baseRef.current[i] = base
      streakRef.current[i] = 0

      laneRef.current[i] = 0
      sideRef.current[i] = 0
      phaseRef.current[i] = 0
      holdRef.current[i] = 0

      posXRef.current[i] = 0
      posYRef.current[i] = 0
      rotRef.current[i] = 0

      targetIdRef.current[i] = []
      beingOvertakenRef.current[i] = 0

      lapsRef.current[i] = 0

      const carAnim = cars[i]
      if (carAnim) {
        carAnim.laps.value = 0
        carAnim.progress.value = s0
      }
    }
  }, [
    TUNE.baseSpeed,
    TUNE.packJitter,
    TUNE.packWindowFrac,
    TUNE.speedVariance,
    cars,
    len,
    safeCarCount,
  ])

  /**
   * Public: start a brand new race (re-pack the grid).
   * Does NOT recreate cars and does NOT set state -> safe to call from anywhere.
   */
  const newRace = useCallback(() => {
    stop()
    seedNewRaceRefs()
  }, [seedNewRaceRefs, stop])

  /**
   * Initialise / rebuild cars ONLY when signature changes.
   * This is the ONLY place we call setCars(), preventing update recursion.
   */
  useEffect(() => {
    if (safeCarCount <= 0 || len <= 0) {
      // if track disappears, pause and clear cars once
      stop()
      if (cars.length) setCars([])
      sigRef.current = trackSig
      return
    }

    if (
      sigRef.current === trackSig &&
      cars.length === safeCarCount &&
      idsRef.current.length === safeCarCount
    ) {
      return
    }

    sigRef.current = trackSig
    stop()

    // (re)create cars + ids
    nextIdRef.current = 1
    const created: CarAnim[] = []
    const ids: number[] = []

    for (let i = 0; i < safeCarCount; i++) {
      const id = nextIdRef.current++
      ids.push(id)
      created.push({
        id,
        x: makeMutable(0),
        y: makeMutable(0),
        rotDeg: makeMutable(0),
        progress: makeMutable(0),
        laps: makeMutable(0),
      })
    }

    idsRef.current = ids

    // allocate arrays to correct length
    sRef.current = new Array(safeCarCount).fill(0)
    vRef.current = new Array(safeCarCount).fill(0)
    baseRef.current = new Array(safeCarCount).fill(0)
    streakRef.current = new Array(safeCarCount).fill(0)

    laneRef.current = new Array(safeCarCount).fill(0)
    sideRef.current = new Array(safeCarCount).fill(0)
    phaseRef.current = new Array(safeCarCount).fill(0) as OvertakePhase[]
    holdRef.current = new Array(safeCarCount).fill(0)

    posXRef.current = new Array(safeCarCount).fill(0)
    posYRef.current = new Array(safeCarCount).fill(0)
    rotRef.current = new Array(safeCarCount).fill(0)

    targetIdRef.current = new Array(safeCarCount).fill(0).map(() => [])
    beingOvertakenRef.current = new Array(safeCarCount).fill(0)

    lapsRef.current = new Array(safeCarCount).fill(0)

    // seed initial race pack
    const rand = mulberry32(12345)
    const packLen = Math.max(1, len * TUNE.packWindowFrac)
    const spacing = safeCarCount > 1 ? packLen / (safeCarCount - 1) : 0
    const anchor = 0
    for (let i = 0; i < safeCarCount; i++) {
      const variance = 1 + (rand() * 2 - 1) * TUNE.speedVariance
      const base = TUNE.baseSpeed * variance
      const jitter = (rand() * 2 - 1) * TUNE.packJitter
      const s0 = (anchor - i * spacing + jitter + len * 10) % len
      sRef.current[i] = s0
      vRef.current[i] = base
      baseRef.current[i] = base

      created[i].laps.value = 0
      created[i].progress.value = s0
    }

    setCars(created)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    trackSig,
    safeCarCount,
    len,
    stop,
    TUNE.baseSpeed,
    TUNE.packJitter,
    TUNE.packWindowFrac,
    TUNE.speedVariance,
  ])

  const start = useCallback(() => {
    if (runningRef.current) return
    if (len === 0 || safeCarCount === 0) return
    if (cars.length !== safeCarCount || idsRef.current.length !== safeCarCount) return // not initialised yet

    runningRef.current = true
    lastTsRef.current = null

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

    const tick = (ts: number) => {
      if (!runningRef.current) return

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

      // ---------------------------
      // Build ordered cars by s
      // ---------------------------
      const order = ids.map((id, i) => ({ i, id, s: sArr[i], v: vArr[i] }))
      order.sort((a, b) => a.s - b.s)

      const getNextAhead = (i: number) => {
        for (let kk = 0; kk < order.length; kk++) {
          if (order[kk].i === i) return order[(kk + 1) % order.length]
        }
        return null
      }

      // ---------------------------
      // Recompute "being overtaken"
      // ---------------------------
      beingOvertakenRef.current.fill(0)
      for (let i = 0; i < ids.length; i++) {
        const tgt = getActiveTarget(i)
        if (tgt && phaseArr[i] !== 0) {
          const ti = ids.indexOf(tgt)
          if (ti >= 0) beingOvertakenRef.current[ti] = 1
        }
      }

      const isOvertaking = (i: number) => phaseArr[i] !== 0
      const isBeingOvertaken = (i: number) => beingOvertakenRef.current[i] === 1
      const isLocked = (i: number) => isOvertaking(i) || isBeingOvertaken(i)

      const leaderHasActivePass = (leaderId: number, leaderS: number) => {
        for (let j = 0; j < ids.length; j++) {
          const active = getActiveTarget(j)
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
          const active = getActiveTarget(j)
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

      // ---------------------------
      // Initiate overtakes
      // ---------------------------
      for (let k = 0; k < order.length; k++) {
        const leader = order[k]
        const follower = order[(k - 1 + order.length) % order.length]
        const gapBehind = (leader.s - follower.s + len) % len
        const speedAdv = follower.v - leader.v
        const fi = follower.i

        if (phaseArr[fi] !== 0) continue
        if (isLocked(fi) || isLocked(leader.i)) continue
        if (leaderHasActivePass(leader.id, leader.s)) continue

        if (gapBehind < TUNE.gapStart && speedAdv > TUNE.minSpeedAdv) {
          const preferred = follower.id < leader.id ? -1 : 1
          const side = pickSideForLeader(leader.id, preferred)
          if (side === 0) continue

          sideArr[fi] = side
          phaseArr[fi] = 1
          targetIdRef.current[fi] = [leader.id]
          beingOvertakenRef.current[leader.i] = 1
        }
      }

      // ---------------------------
      // Main sim per car
      // ---------------------------
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

        let target = baseArr[i]
        target *= 1 + (TUNE.accelOnStraights - 1) * streakFactor
        if (cornerNow) target *= TUNE.cornerMul
        if (!cornerNow && cornerNext && frac > TUNE.preBrakeWindow) target *= TUNE.preBrakeMul
        if (phaseArr[i] === 1 || phaseArr[i] === 2) target *= TUNE.overtakeBoost

        const maxV = baseArr[i] * TUNE.maxMul
        const minV = baseArr[i] * TUNE.minMul
        if (target > maxV) target = maxV
        if (target < minV) target = minV

        const v = vArr[i] + (target - vArr[i]) * (1 - Math.exp(-TUNE.accelRate * dt))
        vArr[i] = v

        const prevS = sArr[i]
        let ns = sArr[i] + v * dt

        // ✅ Lap counting (wrap at len)
        if (len > 0) {
          if (ns >= len) {
            const wraps = Math.floor(ns / len)
            lapsRef.current[i] = Math.min(TUNE.maxLap, (lapsRef.current[i] ?? 0) + wraps)
            ns = ns % len
          } else if (ns < 0) {
            // shouldn’t happen, but keep safe
            ns = ((ns % len) + len) % len
          } else {
            // ultra-safe: detect crossing due to floating drift
            if (prevS > ns && prevS - ns > len * 0.5) {
              lapsRef.current[i] = Math.min(TUNE.maxLap, (lapsRef.current[i] ?? 0) + 1)
            }
          }
        }

        ns %= len
        if (ns < 0) ns += len
        sArr[i] = ns

        // ✅ write leaderboard SVs
        const carAnim = cars[i]
        if (carAnim) {
          const lp = lapsRef.current[i] ?? 0
          carAnim.laps.value = lp
          carAnim.progress.value = lp * len + ns
        }

        // phase transitions (unchanged)
        if (phaseArr[i] !== 0) {
          const activeTargetId = getActiveTarget(i)
          const ahead = getNextAhead(i)
          const gapAhead = ahead ? (ahead.s - sArr[i] + len) % len : Infinity

          let stillAlongside = false
          if (activeTargetId) {
            const ti = ids.indexOf(activeTargetId)
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
              targetIdRef.current[i] = [...list, ahead.id]
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
            if (!stillAlongside) {
              const chained = tryChainTarget()
              if (!chained) holdArr[i] = Math.max(0, holdArr[i] - dt)
            } else {
              holdArr[i] = Math.max(holdArr[i], 0.1)
            }

            if (!stillAlongside && holdArr[i] <= 0 && Math.abs(laneArr[i]) < 0.05) {
              phaseArr[i] = 0
              sideArr[i] = 0
              targetIdRef.current[i] = []
            }
          }
        }
      }

      // ---------------------------
      // Lane planning (unchanged)
      // ---------------------------
      const desired = new Array<number>(ids.length).fill(0)
      for (let i = 0; i < ids.length; i++) {
        desired[i] = phaseArr[i] === 1 || phaseArr[i] === 2 ? sideArr[i] : 0
      }

      const snapLane = (x: number) => (x <= -0.5 ? -1 : x >= 0.5 ? 1 : 0)

      const canTakeLane = (i: number, L: number) => {
        for (let kk = 0; kk < order.length; kk++) {
          if (order[kk].i !== i) continue
          const ahead = order[(kk + 1) % order.length]
          const behind = order[(kk - 1 + order.length) % order.length]

          const gAhead = (ahead.s - sRef.current[i] + len) % len
          const gBehind = (sRef.current[i] - behind.s + len) % len

          if (gAhead < TUNE.minLongGap && snapLane(desired[ahead.i]) === L) return false
          if (gBehind < TUNE.minLongGap && snapLane(desired[behind.i]) === L) return false
          return true
        }
        return true
      }

      for (let iter = 0; iter < TUNE.resolveIters; iter++) {
        for (let k = 0; k < order.length; k++) {
          const follower = order[(k - 1 + order.length) % order.length]
          const leader = order[k]

          const fi = follower.i
          const li = leader.i

          const gap = (leader.s - follower.s + len) % len
          if (gap >= TUNE.minLongGap) continue

          const fLane = snapLane(desired[fi])
          const lLane = snapLane(desired[li])
          if (fLane !== lLane) continue

          const fOver = phaseArr[fi] === 1 || phaseArr[fi] === 2
          const lOver = phaseArr[li] === 1 || phaseArr[li] === 2

          const firstYield = !fOver && lOver ? fi : !lOver && fOver ? li : fi
          const secondYield = firstYield === fi ? li : fi

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

      for (let i = 0; i < ids.length; i++) {
        const targetLane = snapLane(desired[i])
        const ease = targetLane === 0 ? TUNE.laneEaseBack : TUNE.laneEaseOut
        laneArr[i] = laneArr[i] + (targetLane - laneArr[i]) * (1 - Math.exp(-ease * dt))
      }

      // ---------------------------
      // Pose target + follow (unchanged)
      // ---------------------------
      const targetPx = new Array<number>(sArr.length).fill(0)
      const targetPy = new Array<number>(sArr.length).fill(0)
      const rotDegArr = new Array<number>(sArr.length).fill(0)
      const rotRadArr = new Array<number>(sArr.length).fill(0)

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
        const rotDeg = normAngleDeg(entryDeg + shortestDeltaDeg(entryDeg, exitDeg) * localT)
        rotDegArr[i] = rotDeg
        rotRadArr[i] = (rotDeg * Math.PI) / 180

        let dx = 0
        let dy = 0

        if (!isCorner(entryDir2, exitDir2)) {
          const straightOffset = -1 + 2 * localT
          if (exitDir2 === 'E') dx = straightOffset
          else if (exitDir2 === 'W') dx = -straightOffset
          else if (exitDir2 === 'S') dy = straightOffset
          else dy = -straightOffset
        } else {
          const s0 = entryPoint(entryDir2)
          const e0 = exitPoint(exitDir2)
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
      const px = new Array<number>(sArr.length).fill(0)
      const py = new Array<number>(sArr.length).fill(0)

      for (let i = 0; i < ids.length; i++) {
        const lastX = posXRef.current[i] ?? targetPx[i]
        const lastY = posYRef.current[i] ?? targetPy[i]

        if (lastX === 0 && lastY === 0 && posXRef.current[i] === 0 && posYRef.current[i] === 0) {
          posXRef.current[i] = targetPx[i]
          posYRef.current[i] = targetPy[i]
        }

        px[i] =
          (posXRef.current[i] ?? targetPx[i]) +
          (targetPx[i] - (posXRef.current[i] ?? targetPx[i])) * followAlpha
        py[i] =
          (posYRef.current[i] ?? targetPy[i]) +
          (targetPy[i] - (posYRef.current[i] ?? targetPy[i])) * followAlpha
      }

      // ---------------------------
      // Pixel-space collision resolve (unchanged)
      // ---------------------------
      const slop = TUNE.collideSlopPx
      const hx = halfW + slop
      const hy = halfH + slop

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (Math.abs(px[i] - px[j]) < 1e-6 && Math.abs(py[i] - py[j]) < 1e-6) {
            const n = (ids[i] * 1103515245 + ids[j] * 12345) >>> 0
            const ang = ((n % 360) * Math.PI) / 180
            px[j] += Math.cos(ang) * 0.25
            py[j] += Math.sin(ang) * 0.25
          }
        }
      }

      for (let iter = 0; iter < TUNE.collideIters; iter++) {
        let any = false

        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const dx = px[j] - px[i]
            const dy = py[j] - py[i]
            const rr = Math.max(hx, hy) * 2.0
            if (dx * dx + dy * dy > rr * rr) continue

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
            if (!mtv) continue
            any = true

            const h0 = { x: Math.cos(rotRadArr[i]), y: Math.sin(rotRadArr[i]) }
            const h1 = { x: Math.cos(rotRadArr[j]), y: Math.sin(rotRadArr[j]) }
            let tan = normalize({ x: h0.x + h1.x, y: h0.y + h1.y })
            if (
              !Number.isFinite(tan.x) ||
              !Number.isFinite(tan.y) ||
              Math.hypot(tan.x, tan.y) < 1e-6
            ) {
              tan = normalize({ x: dx, y: dy })
            }
            const nor = { x: -tan.y, y: tan.x }

            const mtvN = dot(mtv, nor)
            const mtvT = dot(mtv, tan)

            let push = {
              x:
                nor.x * mtvN +
                tan.x * Math.max(-TUNE.tangentPushCapPx, Math.min(TUNE.tangentPushCapPx, mtvT)),
              y:
                nor.y * mtvN +
                tan.y * Math.max(-TUNE.tangentPushCapPx, Math.min(TUNE.tangentPushCapPx, mtvT)),
            }

            push = { x: push.x * 0.5, y: push.y * 0.5 }

            const m = Math.hypot(push.x, push.y)
            if (m > TUNE.maxPushPerIterPx) {
              const s = TUNE.maxPushPerIterPx / m
              push = { x: push.x * s, y: push.y * s }
            }

            const bias = ids[i] < ids[j] ? -0.02 : 0.02
            px[i] -= push.x + nor.x * bias
            py[i] -= push.y + nor.y * bias
            px[j] += push.x + nor.x * bias
            py[j] += push.y + nor.y * bias
          }
        }

        if (!any) break
      }

      for (let i = 0; i < ids.length; i++) {
        posXRef.current[i] = px[i]
        posYRef.current[i] = py[i]
        rotRef.current[i] = rotDegArr[i]
      }

      // Write to shared values
      for (let i = 0; i < sArr.length; i++) {
        const carAnim = cars[i]
        if (carAnim) {
          carAnim.x.value = posXRef.current[i]
          carAnim.y.value = posYRef.current[i]
          carAnim.rotDeg.value = rotRef.current[i]
          // progress/laps are already updated above in the sim loop
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [
    cars,
    cellPx,
    computeDir,
    gapPx,
    len,
    loop,
    padPx,
    safeCarCount,
    TUNE,
    width,
    carWFrac,
    carHFrac,
    carWPx,
    carHPx,
  ])

  useEffect(() => stop, [stop])

  return { cars, start, stop, newRace }
}
