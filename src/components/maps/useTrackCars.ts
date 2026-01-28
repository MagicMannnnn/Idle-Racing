import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Dir = 'N' | 'E' | 'S' | 'W'

export type Car = {
  id: number // ✅ stable unique car ID
  index: number // current tile index (1D)
  dir: Dir // exit direction for this segment (useful for logic)
  dx: number // normalized [-1..+1]
  dy: number // normalized [-1..+1]
  rotDeg: number // smooth heading in degrees (0=N, 90=E, 180=S, 270=W)
}

type UseTrackCarsOpts = {
  loop: number[] // ordered track loop (no duplicate end)
  width: number
  carCount?: number
  stepMs?: number
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

function isCorner(a: Dir, b: Dir) {
  return (a === 'N' || a === 'S') !== (b === 'N' || b === 'S')
}

type CarState = {
  id: number
  pos: number // index INTO loop
}

export function useTrackCars({ loop, width, carCount = 1, stepMs = 500 }: UseTrackCarsOpts) {
  const safeCarCount = Math.min(carCount, loop.length)

  // ✅ stable id generator (does not change across renders)
  const nextIdRef = useRef(1)

  const makeCar = useCallback((pos: number): CarState => ({ id: nextIdRef.current++, pos }), [])

  // ✅ store id + pos together so id is stable while pos changes
  const [carsState, setCarsState] = useState<CarState[]>(() =>
    Array.from({ length: safeCarCount }, (_, i) => ({ id: i + 1, pos: i })),
  )

  // ensure id counter starts above initial ids
  useEffect(() => {
    nextIdRef.current = Math.max(nextIdRef.current, safeCarCount + 1)
  }, [safeCarCount])

  const [t, setT] = useState(0)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)
  const tickStartedAtRef = useRef<number | null>(null)
  const runningRef = useRef(false)

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

  const startAnimLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)

    const step = (now: number) => {
      if (!runningRef.current) return

      const startedAt = tickStartedAtRef.current
      if (startedAt == null) {
        tickStartedAtRef.current = now
        setT(0)
      } else {
        const p = (now - startedAt) / stepMs
        setT(p >= 1 ? 1 : p)
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }, [stepMs])

  const stopAnimLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (intervalRef.current || loop.length === 0) return

    runningRef.current = true
    tickStartedAtRef.current = performance.now()
    setT(0)
    startAnimLoop()

    intervalRef.current = setInterval(() => {
      tickStartedAtRef.current = performance.now()
      setT(0)

      setCarsState((prev) =>
        prev.map((c) => ({
          ...c,
          pos: (c.pos + 1) % loop.length,
        })),
      )
    }, stepMs)
  }, [loop.length, stepMs, startAnimLoop])

  const stop = useCallback(() => {
    runningRef.current = false
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    stopAnimLoop()
  }, [stopAnimLoop])

  const cars: Car[] = useMemo(() => {
    if (loop.length === 0) return []

    const straightOffset = -1 + 2 * t

    return carsState.map(({ id, pos }) => {
      const len = loop.length
      const curr = loop[pos % len]
      const next = loop[(pos + 1) % len]
      const prev = loop[(pos - 1 + len) % len]

      const entryDir = computeDir(prev, curr)
      const exitDir = computeDir(curr, next)

      let dx = 0
      let dy = 0

      const entryDeg = dirToDeg(entryDir)
      const exitDeg = dirToDeg(exitDir)
      const rotDeg = normAngleDeg(entryDeg + shortestDeltaDeg(entryDeg, exitDeg) * t)

      if (!isCorner(entryDir, exitDir)) {
        if (exitDir === 'E') dx = straightOffset
        else if (exitDir === 'W') dx = -straightOffset
        else if (exitDir === 'S') dy = straightOffset
        else if (exitDir === 'N') dy = -straightOffset

        return { id, index: curr, dir: exitDir, dx, dy, rotDeg }
      }

      const s = entryPoint(entryDir)
      const e = exitPoint(exitDir)

      const cx = s.x !== 0 ? s.x : e.x
      const cy = s.y !== 0 ? s.y : e.y

      const a0 = Math.atan2(s.y - cy, s.x - cx)
      const a1 = Math.atan2(e.y - cy, e.x - cx)

      let da = a1 - a0
      if (da > Math.PI) da -= 2 * Math.PI
      if (da < -Math.PI) da += 2 * Math.PI

      const a = a0 + da * t

      dx = cx + Math.cos(a)
      dy = cy + Math.sin(a)

      return { id, index: curr, dir: exitDir, dx, dy, rotDeg }
    })
  }, [carsState, loop, computeDir, t])

  const carsRef = useRef<Car[]>(cars)
  useEffect(() => {
    carsRef.current = cars
  }, [cars])

  const getCars = useCallback(() => carsRef.current, [])

  // Reset cars if loop or count changes:
  // policy: regenerate cars + ids (stable during a run, new when configuration changes)
  useEffect(() => {
    // reset id generator
    nextIdRef.current = 1
    setCarsState(Array.from({ length: safeCarCount }, (_, i) => makeCar(i)))
    setT(0)
    tickStartedAtRef.current = performance.now()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeCarCount, loop.join('|')])

  useEffect(() => stop, [stop])

  return { start, stop, getCars, cars }
}
