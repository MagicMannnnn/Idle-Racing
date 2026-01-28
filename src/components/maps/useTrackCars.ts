import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Dir = 'N' | 'E' | 'S' | 'W'

export type Car = {
  index: number // 1D grid index
  dir: Dir // facing direction
}

type UseTrackCarsOpts = {
  loop: number[] // ordered track loop (no duplicate end)
  width: number
  carCount?: number
  stepMs?: number
}

export function useTrackCars({ loop, width, carCount = 1, stepMs = 1000 }: UseTrackCarsOpts) {
  const safeCarCount = Math.min(carCount, loop.length)

  // car positions are indices INTO `loop`
  const [pos, setPos] = useState<number[]>(() => Array.from({ length: safeCarCount }, (_, i) => i))

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // 🚗 Reactive cars (this is new)
  const cars: Car[] = useMemo(() => {
    if (loop.length === 0) return []

    return pos.map((p) => {
      const curr = loop[p % loop.length]
      const next = loop[(p + 1) % loop.length]
      return { index: curr, dir: computeDir(curr, next) }
    })
  }, [pos, loop, computeDir])

  // Keep imperative getter in sync
  const carsRef = useRef<Car[]>(cars)
  useEffect(() => {
    carsRef.current = cars
  }, [cars])

  const start = useCallback(() => {
    console.log('Starting car movement', loop, stepMs)
    if (intervalRef.current || loop.length === 0) return

    intervalRef.current = setInterval(() => {
      setPos((prev) => prev.map((p) => (p + 1) % loop.length))
    }, stepMs)
  }, [loop.length, stepMs])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const getCars = useCallback(() => {
    return carsRef.current
  }, [])

  // Reset cars if loop or count changes
  useEffect(() => {
    setPos(Array.from({ length: safeCarCount }, (_, i) => i))
  }, [safeCarCount, loop.join('|')])

  // Cleanup
  useEffect(() => stop, [stop])

  return {
    start,
    stop,
    getCars,
    cars, // 👈 reactive value
  }
}
