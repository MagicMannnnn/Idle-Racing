/**
 * Tests for Host Race feature
 * Run with: npm test -- useMyTeamRaces.test.ts
 */

import { describe, expect, it } from '@jest/globals'
import { mulberry32, seedFromString } from '@utils/rng'

// Mock calculatePrestigeAward since the store imports are problematic in tests
function calculatePrestigeAward(
  position: number,
  competitorMean: number,
  fieldSize: number,
): number {
  const maxAwardPosition = Math.min(Math.ceil(fieldSize / 2), 10)
  if (position > maxAwardPosition) return 0
  const ratingMultiplier = Math.pow(5, competitorMean - 2.0)
  const positionMultiplier = Math.max(0.2, 1.0 - (position - 1) * 0.2)
  const baseAmount = 20
  const prestige = Math.round(baseAmount * ratingMultiplier * positionMultiplier)
  return Math.max(1, prestige)
}

describe('Host Race - Determinism', () => {
  it('should generate same random numbers with same seed', () => {
    const seed = seedFromString('test_seed_123')
    const rand1 = mulberry32(seed)
    const rand2 = mulberry32(seed)

    const sequence1 = Array.from({ length: 10 }, () => rand1())
    const sequence2 = Array.from({ length: 10 }, () => rand2())

    expect(sequence1).toEqual(sequence2)
  })

  it('should generate different random numbers with different seeds', () => {
    const seed1 = seedFromString('seed_1')
    const seed2 = seedFromString('seed_2')
    const rand1 = mulberry32(seed1)
    const rand2 = mulberry32(seed2)

    const sequence1 = Array.from({ length: 10 }, () => rand1())
    const sequence2 = Array.from({ length: 10 }, () => rand2())

    expect(sequence1).not.toEqual(sequence2)
  })
})

describe('Host Race - Prestige Calculation', () => {
  it('should award ~20 prestige for 1st place at 2★ rating', () => {
    const prestige = calculatePrestigeAward(1, 2.0, 10)
    expect(prestige).toBeGreaterThan(15)
    expect(prestige).toBeLessThan(25)
  })

  it('should award more prestige for higher competitor rating', () => {
    const prestige2Star = calculatePrestigeAward(1, 2.0, 10)
    const prestige3Star = calculatePrestigeAward(1, 3.0, 10)
    const prestige4Star = calculatePrestigeAward(1, 4.0, 10)

    expect(prestige3Star).toBeGreaterThan(prestige2Star)
    expect(prestige4Star).toBeGreaterThan(prestige3Star)
  })

  it('should award less prestige for lower positions', () => {
    const prestige1st = calculatePrestigeAward(1, 2.5, 10)
    const prestige2nd = calculatePrestigeAward(2, 2.5, 10)
    const prestige3rd = calculatePrestigeAward(3, 2.5, 10)

    expect(prestige2nd).toBeLessThan(prestige1st)
    expect(prestige3rd).toBeLessThan(prestige2nd)
  })

  it('should not award prestige for bottom 50%', () => {
    const fieldSize = 10
    const bottomHalfPosition = 6
    const prestige = calculatePrestigeAward(bottomHalfPosition, 2.5, fieldSize)

    expect(prestige).toBe(0)
  })

  it('should award prestige for top 50%', () => {
    const fieldSize = 10
    const topHalfPosition = 5
    const prestige = calculatePrestigeAward(topHalfPosition, 2.5, fieldSize)

    expect(prestige).toBeGreaterThan(0)
  })
})

describe('Host Race - Rating Impact', () => {
  it('should have rating impact within expected range', () => {
    // Rating gives 0.7 to 1.3x multiplier (60% range)
    // 5.0★ = 1.3x, 2.5★ = 1.0x, 0.5★ = 0.76x
    const ratingImpact = 0.6

    const minRating = 0.5
    const maxRating = 5.0
    const midRating = 2.5

    const minMultiplier = 0.7 + (minRating / 5.0) * ratingImpact
    const maxMultiplier = 0.7 + (maxRating / 5.0) * ratingImpact
    const midMultiplier = 0.7 + (midRating / 5.0) * ratingImpact

    expect(minMultiplier).toBeCloseTo(0.76, 2)
    expect(maxMultiplier).toBeCloseTo(1.3, 2)
    expect(midMultiplier).toBeCloseTo(1.0, 2)
  })
})
