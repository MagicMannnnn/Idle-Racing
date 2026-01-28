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

export function useTrackCars({
  loop,
  width,
  carCount = 5,
  cellPx,
  gapPx,
  padPx,
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
      minMul: 0.5,

      // Overtakes
      gapStart: 0.42,
      passMargin: 1.0,
      minSpeedAdv: 0.2,
      overtakeBoost: 1.1,

      laneOffset: 0.75,
      laneEaseOut: 2.0,
      laneEaseBack: 1.0,
      laneHold: 0.15,

      // NEW: multi-overtake safety
      alongsideGap: 0.62, // "still alongside" window
      lockWindow: 1.35, // extra window around leader to prevent chain overtakes
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

  // NEW: lock who you're overtaking (and leader lock)
  const targetIdRef = useRef<number[]>([]) // 0 or leader id
  const beingOvertakenRef = useRef<number[]>([]) // 0/1 recomputed each tick

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

      targetIdRef.current.push(0)
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

      // ---------------------------
      // Recompute "being overtaken"
      // ---------------------------
      beingOvertakenRef.current.fill(0)
      for (let i = 0; i < ids.length; i++) {
        const tgt = targetIdRef.current[i]
        if (tgt && phaseArr[i] !== 0) {
          // mark target as being overtaken
          const ti = ids.indexOf(tgt)
          if (ti >= 0) beingOvertakenRef.current[ti] = 1
        }
      }

      const isOvertaking = (i: number) => phaseArr[i] !== 0
      const isBeingOvertaken = (i: number) => beingOvertakenRef.current[i] === 1
      const isLocked = (i: number) => isOvertaking(i) || isBeingOvertaken(i)

      // ---------------------------
      // Helper: is someone already overtaking this leader nearby?
      // (prevents multi cars launching at same leader + overlap)
      // ---------------------------
      const leaderHasActivePass = (leaderId: number, leaderS: number) => {
        for (let j = 0; j < ids.length; j++) {
          if (targetIdRef.current[j] !== leaderId) continue
          if (phaseArr[j] === 0) continue
          const g = (leaderS - sArr[j] + len) % len
          if (g < TUNE.lockWindow) return true
        }
        return false
      }

      // ---------------------------
      // Helper: choose a side that isn't "reserved" around a leader
      // ---------------------------
      const pickSideForLeader = (leaderId: number, preferred: number) => {
        let leftUsed = false
        let rightUsed = false
        for (let j = 0; j < ids.length; j++) {
          if (targetIdRef.current[j] !== leaderId) continue
          if (phaseArr[j] === 0) continue
          const sgn = sideArr[j]
          if (sgn < 0) leftUsed = true
          if (sgn > 0) rightUsed = true
        }

        // if preferred is free, take it
        if (preferred < 0 && !leftUsed) return -1
        if (preferred > 0 && !rightUsed) return 1

        // otherwise take the other if free
        if (!leftUsed) return -1
        if (!rightUsed) return 1

        // both used: don't start an overtake (caller should handle)
        return 0
      }

      // ---------------------------
      // Initiate overtakes (follower only) with locks
      // ---------------------------
      for (let k = 0; k < order.length; k++) {
        const leader = order[k]
        const follower = order[(k - 1 + order.length) % order.length]
        const gapBehind = (leader.s - follower.s + len) % len
        const speedAdv = follower.v - leader.v
        const fi = follower.i
        const li = leader.i

        // Must be free
        if (phaseArr[fi] !== 0) continue

        // If either car is involved in any overtake, block chain overtakes
        if (isLocked(fi) || isLocked(li)) continue

        // If someone is already overtaking this leader nearby, don't start another
        if (leaderHasActivePass(leader.id, leader.s)) continue

        if (gapBehind < TUNE.gapStart && speedAdv > TUNE.minSpeedAdv) {
          const preferred = follower.id < leader.id ? -1 : 1
          const side = pickSideForLeader(leader.id, preferred)
          if (side === 0) continue // both sides taken near this leader

          sideArr[fi] = side
          phaseArr[fi] = 1 // OUT
          targetIdRef.current[fi] = leader.id // lock the target
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

        // phase transitions using *target lock*
        if (phaseArr[i] !== 0) {
          const targetId = targetIdRef.current[i]

          // compute gap ahead (next car in order) for general “clear” check
          let gapAhead = Infinity
          for (let kk = 0; kk < order.length; kk++) {
            if (order[kk].i === i) {
              const ahead = order[(kk + 1) % order.length]
              gapAhead = (ahead.s - sArr[i] + len) % len
              break
            }
          }

          // also measure if we're still alongside our locked target (prevents overlap + early merge)
          let stillAlongside = false
          if (targetId) {
            const ti = ids.indexOf(targetId)
            if (ti >= 0) {
              const behindTarget = (sArr[ti] - sArr[i] + len) % len
              stillAlongside = behindTarget < TUNE.alongsideGap
            }
          }

          if (phaseArr[i] === 1) {
            if (Math.abs(laneArr[i] - sideArr[i]) > 0.9) phaseArr[i] = 2
          } else if (phaseArr[i] === 2) {
            // don't start returning while still alongside (major overlap fix)
            if (!stillAlongside && gapAhead > TUNE.gapStart + TUNE.passMargin) {
              holdArr[i] = TUNE.laneHold
              phaseArr[i] = 3
            }
          } else if (phaseArr[i] === 3) {
            // while still alongside, keep holding the outside line
            if (stillAlongside) {
              holdArr[i] = Math.max(holdArr[i], 0.1)
            } else {
              holdArr[i] = Math.max(0, holdArr[i] - dt)
            }

            if (!stillAlongside && holdArr[i] <= 0 && Math.abs(laneArr[i]) < 0.05) {
              phaseArr[i] = 0
              sideArr[i] = 0
              targetIdRef.current[i] = 0 // release lock
            }
          }
        }

        // lane smoothing
        const targetLane = phaseArr[i] === 1 || phaseArr[i] === 2 ? sideArr[i] : 0
        const ease = targetLane === 0 ? TUNE.laneEaseBack : TUNE.laneEaseOut
        laneArr[i] = laneArr[i] + (targetLane - laneArr[i]) * (1 - Math.exp(-ease * dt))

        // ----- pose from updated ns -----
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

        const rad = (rotDeg * Math.PI) / 180
        const laneAmt = laneArr[i] * TUNE.laneOffset
        const ox = Math.cos(rad) * laneAmt
        const oy = Math.sin(rad) * laneAmt

        const { cx, cy } = idxToCenter(curr2)

        const carAnim = cars[i]
        if (carAnim) {
          carAnim.x.value = cx + (dx + ox) * halfStep
          carAnim.y.value = cy + (dy + oy) * halfStep
          carAnim.rotDeg.value = rotDeg
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [cars, cellPx, computeDir, gapPx, len, loop, padPx, safeCarCount, TUNE, width])

  useEffect(() => {
    resetSim()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCarCount, loop.join('|'), cellPx, gapPx, padPx])

  useEffect(() => stop, [stop])

  return { cars, start, stop }
}
