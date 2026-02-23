import { describe, expect, it } from '@jest/globals'

// Mock the dependencies
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
  },
}))

jest.mock('../../src/state/useMoney', () => ({
  useMoney: {
    getState: jest.fn(() => ({
      canAfford: jest.fn(() => true),
      spend: jest.fn(() => true),
    })),
  },
}))

const { useTeam } = require('../../src/state/useTeam')

describe('useTeam', () => {
  it('should have initial HQ state', () => {
    const state = useTeam.getState()
    expect(state.hq.level).toBe(1)
    expect(state.hq.upgrading).toBe(false)
    expect(state.hq.maxDriverRating).toBe(2)
  })

  it('should have no drivers initially', () => {
    const state = useTeam.getState()
    expect(state.drivers).toHaveLength(0)
  })

  it('should have initial car upgrades', () => {
    const state = useTeam.getState()
    expect(state.upgrades).toHaveLength(6)
    expect(state.upgrades.find((u: any) => u.type === 'engine')).toBeDefined()
    expect(state.upgrades.find((u: any) => u.type === 'tires')).toBeDefined()
  })

  it('should quote HQ upgrade correctly', () => {
    const state = useTeam.getState()
    const quote = state.quoteHQUpgrade()

    expect(quote.ok).toBe(true)
    if (quote.ok) {
      expect(quote.fromLevel).toBe(1)
      expect(quote.toLevel).toBe(2)
      expect(quote.cost).toBeGreaterThan(0)
      expect(quote.time).toBeGreaterThan(0)
    }
  })

  it('should quote driver hire correctly', () => {
    const state = useTeam.getState()
    const contractLength = 120 * 60 * 1000 // 120 minutes in ms
    const quote = state.quoteDriver(2, contractLength)

    expect(quote.ok).toBe(true)
    if (quote.ok) {
      expect(quote.cost).toBeGreaterThan(0)
      expect(quote.time).toBeGreaterThan(0)
      expect(quote.contractLength).toBe(contractLength)
    }
  })

  it('should not allow hiring driver above HQ rating', () => {
    const state = useTeam.getState()
    const contractLength = 60 * 60 * 1000 // 60 minutes in ms
    const quote = state.quoteDriver(5, contractLength)

    expect(quote.ok).toBe(false)
    if (!quote.ok) {
      expect(quote.reason).toBe('rating_too_high')
    }
  })

  it('should quote car upgrade correctly', () => {
    const state = useTeam.getState()
    const quote = state.quoteCarUpgrade('engine', 'x1')

    expect(quote.ok).toBe(true)
    if (quote.ok) {
      expect(quote.fromLevel).toBe(1)
      expect(quote.toLevel).toBe(2)
      expect(quote.levels).toBe(1)
      expect(quote.cost).toBeGreaterThan(0)
      expect(quote.time).toBeGreaterThan(0)
    }
  })

  it('should have tires start with basic tier', () => {
    const state = useTeam.getState()
    const tires = state.upgrades.find((u: any) => u.type === 'tires')

    expect(tires?.tier).toBe('basic')
    expect(tires?.level).toBe(1)
  })

  it('should have 2 driver slots', () => {
    const state = useTeam.getState()
    expect(state.getDriverSlots()).toBe(2)
  })
})
