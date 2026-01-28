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
    { dx: 0, dy: -1, a: angleFromDelta(0, -1) }, // N
    { dx: 1, dy: 0, a: angleFromDelta(1, 0) }, // E
    { dx: 0, dy: 1, a: angleFromDelta(0, 1) }, // S
    { dx: -1, dy: 0, a: angleFromDelta(-1, 0) }, // W
  ] as const

  let bestAngle: string = dirs[0].a
  let bestDot = -Infinity

  for (const d of dirs) {
    const dot = nx * d.dx + ny * d.dy // already unit vectors
    if (dot > bestDot) {
      bestDot = dot
      bestAngle = d.a
    }
  }

  return bestAngle
}

function angleFromOrthSum(sumX: number, sumY: number) {
  // If both components exist, this is a diagonal -> use it (non-90°)
  const dx = sign(sumX)
  const dy = sign(sumY)
  return angleFromDelta(dx, dy)
}

// Deterministic-ish RNG from a seed (so dots don’t reshuffle on every render)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
}
