import { CellType } from '@/src/state/useTrackMaps'

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

function sign(n: number) {
  return n === 0 ? 0 : n > 0 ? 1 : -1
}

function addDeg(a: string, add: number) {
  const n = Number.parseFloat(a.replace('deg', ''))
  return `${n + add}deg`
}

function angleFromDelta(dx: number, dy: number) {
  const rx = dy
  const ry = -dx

  if (rx === 1 && ry === 0) return '0deg'
  if (rx === 1 && ry === 1) return '45deg'
  if (rx === 0 && ry === 1) return '90deg'
  if (rx === -1 && ry === 1) return '135deg'
  if (rx === -1 && ry === 0) return '180deg'
  if (rx === -1 && ry === -1) return '-135deg'
  if (rx === 0 && ry === -1) return '-90deg'
  if (rx === 1 && ry === -1) return '-45deg'
  return '0deg'
}

function angleFromVector4(vx: number, vy: number) {
  const mag = Math.hypot(vx, vy)
  if (mag < 1e-6) return '0deg'

  const nx = vx / mag
  const ny = vy / mag

  const dirs = [
    { dx: 0, dy: -1, a: angleFromDelta(0, -1) },
    { dx: 1, dy: 0, a: angleFromDelta(1, 0) },
    { dx: 0, dy: 1, a: angleFromDelta(0, 1) },
    { dx: -1, dy: 0, a: angleFromDelta(-1, 0) },
  ] as const

  let bestAngle: string = dirs[0].a
  let bestDot = -Infinity

  for (const d of dirs) {
    const dot = nx * d.dx + ny * d.dy
    if (dot > bestDot) {
      bestDot = dot
      bestAngle = d.a
    }
  }

  return bestAngle
}

function angleFromOrthSum(sumX: number, sumY: number) {
  const dx = sign(sumX)
  const dy = sign(sumY)
  return angleFromDelta(dx, dy)
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildTrackLoop(cells: CellType[], width: number): number[] {
  if (width <= 0) return []
  if (cells.length % width !== 0) return []

  const height = cells.length / width

  const idx = (r: number, c: number) => r * width + c
  const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < height && c < width
  const isTrack = (r: number, c: number) => inBounds(r, c) && cells[idx(r, c)] === 'track'
  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ] as const

  const trackIndices: number[] = []
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 'track') trackIndices.push(i)
  }
  if (trackIndices.length === 0) return []
  const degree2Starts: number[] = []
  for (const i of trackIndices) {
    const r = Math.floor(i / width)
    const c = i % width
    let deg = 0
    for (const [dr, dc] of dirs) {
      if (isTrack(r + dr, c + dc)) deg++
    }
    if (deg === 2) degree2Starts.push(i)
  }
  const start = (degree2Starts.length ? degree2Starts : trackIndices)[0]
  if (start == null) return []

  const route: number[] = []
  const visited = new Set<number>()

  let current = start
  let prev = -1
  const maxSteps = trackIndices.length + 1

  for (let steps = 0; steps < maxSteps; steps++) {
    route.push(current)
    visited.add(current)

    const r = Math.floor(current / width)
    const c = current % width
    const candidates: number[] = []
    for (const [dr, dc] of dirs) {
      const nr = r + dr
      const nc = c + dc
      if (!isTrack(nr, nc)) continue
      const ni = idx(nr, nc)
      if (ni === prev) continue
      candidates.push(ni)
    }
    if (candidates.includes(start) && visited.size === trackIndices.length) {
      return route
    }
    const next = candidates.find((ni) => !visited.has(ni))
    if (next == null) {
      return []
    }

    prev = current
    current = next
  }
  return []
}

export {
  fnv1a32,
  mix32,
  layoutHash,
  toXY,
  sign,
  addDeg,
  angleFromDelta,
  angleFromVector4,
  angleFromOrthSum,
  mulberry32,
  buildTrackLoop,
}
