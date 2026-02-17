import Decimal from 'break_infinity.js'

export type BigNum = Decimal | number

export const BN = {
  // Conversion
  from: (n: BigNum | string): Decimal => {
    if (n instanceof Decimal) return n
    return new Decimal(n)
  },

  zero: () => new Decimal(0),
  one: () => new Decimal(1),

  // Arithmetic operations
  add: (a: BigNum, b: BigNum): Decimal => BN.from(a).add(b),
  sub: (a: BigNum, b: BigNum): Decimal => BN.from(a).sub(b),
  mul: (a: BigNum, b: BigNum): Decimal => BN.from(a).mul(b),
  div: (a: BigNum, b: BigNum): Decimal => BN.from(a).div(b),
  pow: (a: BigNum, b: BigNum): Decimal => BN.from(a).pow(b),

  // Comparison operations
  gt: (a: BigNum, b: BigNum): boolean => BN.from(a).gt(b),
  gte: (a: BigNum, b: BigNum): boolean => BN.from(a).gte(b),
  lt: (a: BigNum, b: BigNum): boolean => BN.from(a).lt(b),
  lte: (a: BigNum, b: BigNum): boolean => BN.from(a).lte(b),
  eq: (a: BigNum, b: BigNum): boolean => BN.from(a).eq(b),

  // Utility operations
  max: (a: BigNum, b: BigNum): Decimal => Decimal.max(BN.from(a), BN.from(b)),
  min: (a: BigNum, b: BigNum): Decimal => Decimal.min(BN.from(a), BN.from(b)),
  abs: (n: BigNum): Decimal => BN.from(n).abs(),
  floor: (n: BigNum): Decimal => BN.from(n).floor(),
  ceil: (n: BigNum): Decimal => BN.from(n).ceil(),
  round: (n: BigNum): Decimal => BN.from(n).round(),

  // Conversion out
  toNumber: (n: BigNum): number => BN.from(n).toNumber(),
  toString: (n: BigNum): string => BN.from(n).toString(),

  // Checks - for break_infinity, we check if the number is a valid finite number
  isFinite: (n: BigNum): boolean => {
    const num = BN.from(n).toNumber()
    return Number.isFinite(num)
  },
  isNaN: (n: BigNum): boolean => {
    const num = BN.from(n).toNumber()
    return Number.isNaN(num)
  },
}

// Helper to clamp a value between min and max
export const clamp = (n: BigNum, min: BigNum, max: BigNum): Decimal => {
  return BN.max(min, BN.min(max, n))
}

// Helper to clamp to 0 minimum
export const clamp0 = (n: BigNum): Decimal => {
  return BN.max(0, n)
}
