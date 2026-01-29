import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeMutable, type SharedValue } from 'react-native-reanimated'

type Dir = 'N' | 'E' | 'S' | 'W'

export type CarAnim = {
  id: number
  x: SharedValue<number>
  y: SharedValue<number>
  rotDeg: SharedValue<number>
}

type UseTrackCarsOpts = {
  loop: number[]
  width: number
  carCount?: number
  cellPx: number
  gapPx: number
  padPx: number

  /**
   * Car size as a fraction of cellPx (matches your current CellCars defaults)
   * - default: carW = cellPx / 6, carH = cellPx / 4
   */
  carWFrac?: number
  carHFrac?: number

  /**
   * Optional: override sizes in pixels (takes priority over frac).
   * If you don't pass these, it will use the frac values above.
   */
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
    { x: c, y: s }, // local X axis
    { x: -s, y: c }, // local Y axis
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
      followRate: 18.0, // higher => cars snap back to the path faster (but still smooth)
      collideIters: 8,
      collideSlopPx: 0.75,
      maxPushPerIterPx: 3.5,

      // IMPORTANT: prevent “swap” snaps by avoiding pushes along travel direction
      tangentPushCapPx: 0.35, // allow tiny along-track nudge only
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

  // ----- shared-value cars -----
  const [cars, setCars] = useState<CarAnim[]>([])
  const nextIdRef = useRef(1)

  // ----- sim state (refs) -----
  const idsRef = useRef<number[]>([])
  const sRef = useRef<number[]>([])
  const vRef = useRef<number[]>([])
  const baseRef = useRef<number[]>([])
  const streakRef = useRef<number[]>([])

  const laneRef = useRef<number[]>([])
  const sideRef = useRef<number[]>([]) // -1 or +1 during pass
  const phaseRef = useRef<OvertakePhase[]>([])
  const holdRef = useRef<number[]>([])

  // pixel pose state (smoothed / collision-resolved)
  const posXRef = useRef<number[]>([])
  const posYRef = useRef<number[]>([])
  const rotRef = useRef<number[]>([])

  // multi-target lock list (active target is last)
  const targetIdRef = useRef<number[][]>([])
  const beingOvertakenRef = useRef<number[]>([])

  const runningRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    runningRef.current = false
    lastTsRef.current = null
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const getActiveTarget = (i: number) => {
    const list = targetIdRef.current[i]
    return list && list.length ? list[list.length - 1] : 0
  }

  const resetSim = useCallback(() => {
    stop()

    nextIdRef.current = 1
    idsRef.current = []
    sRef.current = []
    vRef.current = []
    baseRef.current = []
    streakRef.current = []

    laneRef.current = []
    sideRef.current = []
    phaseRef.current = []
    holdRef.current = []

    posXRef.current = []
    posYRef.current = []
    rotRef.current = []

    targetIdRef.current = []
    beingOvertakenRef.current = []

    const rand = mulberry32(12345)
    const spacing = safeCarCount > 0 ? len / safeCarCount : 0

    const created: CarAnim[] = []
    for (let i = 0; i < safeCarCount; i++) {
      const id = nextIdRef.current++

      created.push({
        id,
        x: makeMutable(0),
        y: makeMutable(0),
        rotDeg: makeMutable(0),
      })

      const variance = 1 + (rand() * 2 - 1) * TUNE.speedVariance
      const base = TUNE.baseSpeed * variance

      idsRef.current.push(id)
      sRef.current.push(i * spacing)
      vRef.current.push(base)
      baseRef.current.push(base)
      streakRef.current.push(0)

      laneRef.current.push(0)
      sideRef.current.push(0)
      phaseRef.current.push(0)
      holdRef.current.push(0)

      // init to 0; first tick will place
      posXRef.current.push(0)
      posYRef.current.push(0)
      rotRef.current.push(0)

      targetIdRef.current.push([])
      beingOvertakenRef.current.push(0)
    }

    setCars(created)
  }, [TUNE.baseSpeed, TUNE.speedVariance, len, safeCarCount, stop])

  const start = useCallback(() => {
    if (runningRef.current || len === 0 || safeCarCount === 0 || cars.length === 0) return
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
        const li = leader.i

        if (phaseArr[fi] !== 0) continue
        if (isLocked(fi) || isLocked(li)) continue
        if (leaderHasActivePass(leader.id, leader.s)) continue

        if (gapBehind < TUNE.gapStart && speedAdv > TUNE.minSpeedAdv) {
          const preferred = follower.id < leader.id ? -1 : 1
          const side = pickSideForLeader(leader.id, preferred)
          if (side === 0) continue

          sideArr[fi] = side
          phaseArr[fi] = 1
          targetIdRef.current[fi] = [leader.id]
          beingOvertakenRef.current[li] = 1
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

        // streak
        let streak = streakArr[i]
        if (cornerNow) streak = 0
        else if (frac > 0.85) streak = Math.min(TUNE.streakMax, streak + 1)
        streakArr[i] = streak
        const streakFactor = streak / TUNE.streakMax

        // target speed
        let target = baseArr[i]
        target *= 1 + (TUNE.accelOnStraights - 1) * streakFactor
        if (cornerNow) target *= TUNE.cornerMul
        if (!cornerNow && cornerNext && frac > TUNE.preBrakeWindow) target *= TUNE.preBrakeMul
        if (phaseArr[i] === 1 || phaseArr[i] === 2) target *= TUNE.overtakeBoost

        const maxV = baseArr[i] * TUNE.maxMul
        const minV = baseArr[i] * TUNE.minMul
        if (target > maxV) target = maxV
        if (target < minV) target = minV

        // accel smoothing
        const v = vArr[i] + (target - vArr[i]) * (1 - Math.exp(-TUNE.accelRate * dt))
        vArr[i] = v

        // advance
        let ns = sArr[i] + v * dt
        ns %= len
        if (ns < 0) ns += len
        sArr[i] = ns

        // phase transitions
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
      // Lane planning (s/lane space)
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

          const gAhead = (ahead.s - sArr[i] + len) % len
          const gBehind = (sArr[i] - behind.s + len) % len

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
      // Compute target pose (path-follow) -> targetPx/targetPy/rot
      // then smooth-follow -> px/py (warm start for collisions)
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

      // Smooth-follow (prevents snapping/jitter; also prevents “swap” when side-by-side)
      const followAlpha = 1 - Math.exp(-TUNE.followRate * dt)

      const px = new Array<number>(sArr.length).fill(0)
      const py = new Array<number>(sArr.length).fill(0)

      for (let i = 0; i < ids.length; i++) {
        const lastX = posXRef.current[i] ?? targetPx[i]
        const lastY = posYRef.current[i] ?? targetPy[i]

        // first placement
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
      // Pixel-space collision resolve (stable side-by-side)
      // Key change: push mostly PERPENDICULAR to travel direction (normal),
      // and cap tiny along-tangent movement to avoid “swap” snaps.
      // ---------------------------
      const slop = TUNE.collideSlopPx
      const hx = halfW + slop
      const hy = halfH + slop

      // deterministic tiny nudge if exact overlap
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
            // quick reject
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

            // Average heading -> tangent/normal
            const h0 = { x: Math.cos(rotRadArr[i]), y: Math.sin(rotRadArr[i]) }
            const h1 = { x: Math.cos(rotRadArr[j]), y: Math.sin(rotRadArr[j]) }
            let tan = normalize({ x: h0.x + h1.x, y: h0.y + h1.y })
            // if opposite headings (rare on a loop), fall back to pair vector
            if (
              !Number.isFinite(tan.x) ||
              !Number.isFinite(tan.y) ||
              Math.hypot(tan.x, tan.y) < 1e-6
            ) {
              tan = normalize({ x: dx, y: dy })
            }
            const nor = { x: -tan.y, y: tan.x }

            // Decompose MTV into normal + tangent, but heavily prefer normal
            const mtvN = dot(mtv, nor)
            const mtvT = dot(mtv, tan)

            // mostly separate sideways
            let push = {
              x:
                nor.x * mtvN +
                tan.x * Math.max(-TUNE.tangentPushCapPx, Math.min(TUNE.tangentPushCapPx, mtvT)),
              y:
                nor.y * mtvN +
                tan.y * Math.max(-TUNE.tangentPushCapPx, Math.min(TUNE.tangentPushCapPx, mtvT)),
            }

            // Split push evenly
            push = { x: push.x * 0.5, y: push.y * 0.5 }

            // Clamp per iter for smoothness
            const m = Math.hypot(push.x, push.y)
            if (m > TUNE.maxPushPerIterPx) {
              const s = TUNE.maxPushPerIterPx / m
              push = { x: push.x * s, y: push.y * s }
            }

            // Deterministic bias: keep ordering stable when side-by-side
            // (prevents “swap” when both pushes are symmetric)
            const bias = ids[i] < ids[j] ? -0.02 : 0.02
            px[i] -= push.x + nor.x * bias
            py[i] -= push.y + nor.y * bias
            px[j] += push.x + nor.x * bias
            py[j] += push.y + nor.y * bias
          }
        }

        if (!any) break
      }

      // Persist smoothed + collision-resolved positions
      for (let i = 0; i < ids.length; i++) {
        posXRef.current[i] = px[i]
        posYRef.current[i] = py[i]
        rotRef.current[i] = rotDegArr[i]
      }

      // ---------------------------
      // Write to shared values
      // ---------------------------
      for (let i = 0; i < sArr.length; i++) {
        const carAnim = cars[i]
        if (carAnim) {
          carAnim.x.value = posXRef.current[i]
          carAnim.y.value = posYRef.current[i]
          carAnim.rotDeg.value = rotRef.current[i]
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

  useEffect(() => {
    resetSim()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCarCount, loop.join('|'), cellPx, gapPx, padPx])

  useEffect(() => stop, [stop])

  return { cars, start, stop }
}
