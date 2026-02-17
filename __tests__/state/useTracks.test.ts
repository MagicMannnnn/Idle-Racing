const STORE_IMPORT_PATH = '@state/useTracks'

function makeLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
}

function createZustandMock() {
  return (initializer: (set: any, get: any) => any) => {
    let state: any
    const listeners = new Set<() => void>()

    const get = () => state
    const set = (partial: any) => {
      if (typeof partial === 'function') state = { ...state, ...partial(state) }
      else state = { ...state, ...partial }
      listeners.forEach((l) => l())
    }

    state = initializer(set, get)

    const useStore: any = (selector?: (s: any) => any) => (selector ? selector(state) : state)
    useStore.getState = () => state
    useStore.setState = (partial: any) => set(partial)
    useStore.subscribe = (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
    return useStore
  }
}

function createZustandMiddlewareMock() {
  return {
    persist: (initializer: any) => initializer,
    createJSONStorage: (getStorage: any) => getStorage(),
  }
}

let mockMoney = 1000
const mockMoneyStore = {
  canAfford: jest.fn((amount: number) => mockMoney >= amount),
  spend: jest.fn((amount: number) => {
    if (mockMoney >= amount) {
      mockMoney -= amount
      return true
    }
    return false
  }),
}

function loadWithPlatform(
  os: 'web' | 'ios' | 'android',
  opts?: { seedTracks?: any[]; initialMoney?: number },
): { useTracks: any } {
  jest.resetModules()

  mockMoney = opts?.initialMoney ?? 1000
  mockMoneyStore.canAfford.mockClear()
  mockMoneyStore.spend.mockClear()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (opts?.seedTracks) {
      ;(global as any).localStorage.setItem(
        'idle.tracks.v4',
        JSON.stringify({ state: { tracks: opts.seedTracks }, version: 4 }),
      )
    }
  }

  jest.doMock('react-native', () => ({ Platform: { OS: os } }))

  if (os !== 'web') {
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
      },
    }))

    jest.doMock('zustand', () => ({
      create: () => createZustandMock(),
    }))

    jest.doMock('zustand/middleware', () => createZustandMiddlewareMock())
  }

  jest.doMock('@state/useMoney', () => ({
    useMoney: {
      getState: () => ({
        money: mockMoney,
        canAfford: mockMoneyStore.canAfford,
        spend: mockMoneyStore.spend,
      }),
    },
  }))

  let useTracks: any

  jest.isolateModules(() => {
    useTracks = require(STORE_IMPORT_PATH).useTracks
  })

  return { useTracks }
}

describe('useTracks (native/app)', () => {
  it('initializes with empty tracks array', () => {
    const { useTracks } = loadWithPlatform('ios')

    expect(useTracks.getState().tracks).toEqual([])
  })

  it('calculates correct cost for first track (index 0)', () => {
    const { useTracks } = loadWithPlatform('android')

    const cost = useTracks.getState().nextTrackCost()
    expect(cost).toBe(100) // 100 * 10^0 = 100
  })

  it('calculates correct cost for second track (index 1)', () => {
    const { useTracks } = loadWithPlatform('ios', { initialMoney: 100000 })

    useTracks.getState().buyNextTrack('Track 1')
    const cost = useTracks.getState().nextTrackCost()
    expect(cost).toBe(1000) // 100 * 10^1 = 1000
  })

  it('supports buyNextTrack to purchase a new track', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 500 })

    const result = useTracks.getState().buyNextTrack('My Track')

    expect(result.ok).toBe(true)
    expect(result.track).toBeDefined()
    expect(result.track.name).toBe('My Track')
    expect(result.track.id).toBe('track_1')
    expect(result.track.index).toBe(0)
    expect(result.cost).toBe(100)

    expect(useTracks.getState().tracks.length).toBe(1)
    expect(mockMoneyStore.spend).toHaveBeenCalledWith(100)
  })

  it('buyNextTrack fails when not enough money', () => {
    const { useTracks } = loadWithPlatform('ios', { initialMoney: 50 })

    const result = useTracks.getState().buyNextTrack('Expensive Track')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not_enough_money')
    expect(useTracks.getState().tracks.length).toBe(0)
  })

  it('buyNextTrack uses default name if empty string provided', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 500 })

    const result = useTracks.getState().buyNextTrack('')

    expect(result.ok).toBe(true)
    expect(result.track.name).toBe('Track 1')
  })

  it('initializes track with level 1 for all stats', () => {
    const { useTracks } = loadWithPlatform('ios', { initialMoney: 500 })

    const result = useTracks.getState().buyNextTrack('Test')

    expect(result.track.capacityLevel).toBe(1)
    expect(result.track.safetyLevel).toBe(1)
    expect(result.track.entertainmentLevel).toBe(1)
    expect(result.track.rating).toBeGreaterThan(0)
  })

  it('supports getById to retrieve a specific track', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 500 })

    useTracks.getState().buyNextTrack('Track A')
    const track = useTracks.getState().getById('track_1')

    expect(track).toBeDefined()
    expect(track.name).toBe('Track A')
  })

  it('getById returns undefined for non-existent track', () => {
    const { useTracks } = loadWithPlatform('ios')

    const track = useTracks.getState().getById('track_999')
    expect(track).toBeUndefined()
  })

  it('supports quoteCapacityUpgrade for x1 mode', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 500 })

    useTracks.getState().buyNextTrack('Test Track')
    const quote = useTracks.getState().quoteCapacityUpgrade('track_1', 'x1')

    expect(quote.ok).toBe(true)
    if (quote.ok) {
      expect(quote.fromLevel).toBe(1)
      expect(quote.toLevel).toBe(2)
      expect(quote.levels).toBe(1)
      expect(quote.cost).toBeGreaterThan(0)
    }
  })

  it('supports quoteCapacityUpgrade for x10 mode', () => {
    const { useTracks } = loadWithPlatform('ios', { initialMoney: 10000 })

    useTracks.getState().buyNextTrack('Test Track')
    const quote = useTracks.getState().quoteCapacityUpgrade('track_1', 'x10')

    expect(quote.ok).toBe(true)
    if (quote.ok) {
      expect(quote.fromLevel).toBe(1)
      expect(quote.toLevel).toBe(11)
      expect(quote.levels).toBe(10)
    }
  })

  it('supports upgradeCapacityByMode to upgrade capacity', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 10000 })

    useTracks.getState().buyNextTrack('Test Track')
    const result = useTracks.getState().upgradeCapacityByMode('track_1', 'x1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newLevel).toBe(2)
      expect(result.cost).toBeGreaterThan(0)
    }

    const track = useTracks.getState().getById('track_1')
    expect(track.capacityLevel).toBe(2)
  })

  it('upgradeCapacityByMode fails when not enough money', () => {
    const { useTracks } = loadWithPlatform('ios', { initialMoney: 150 })

    useTracks.getState().buyNextTrack('Test Track')
    mockMoney = 10 // Not enough for upgrade

    const result = useTracks.getState().upgradeCapacityByMode('track_1', 'x1')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not_enough_money')
  })

  it('supports upgradeSafetyByMode to upgrade safety', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 10000 })

    useTracks.getState().buyNextTrack('Test Track')
    const result = useTracks.getState().upgradeSafetyByMode('track_1', 'x1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newLevel).toBe(2)
    }

    const track = useTracks.getState().getById('track_1')
    expect(track.safetyLevel).toBe(2)
  })

  it('supports upgradeEntertainmentByMode to upgrade entertainment', () => {
    const { useTracks } = loadWithPlatform('ios', { initialMoney: 10000 })

    useTracks.getState().buyNextTrack('Test Track')
    const result = useTracks.getState().upgradeEntertainmentByMode('track_1', 'x1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newLevel).toBe(2)
    }

    const track = useTracks.getState().getById('track_1')
    expect(track.entertainmentLevel).toBe(2)
  })

  it('supports reset to clear all tracks', () => {
    const { useTracks } = loadWithPlatform('android', { initialMoney: 10000 })

    useTracks.getState().buyNextTrack('Track 1')
    useTracks.getState().buyNextTrack('Track 2')

    expect(useTracks.getState().tracks.length).toBe(2)

    useTracks.getState().reset()
    expect(useTracks.getState().tracks).toEqual([])
  })
})

describe('useTracks (web)', () => {
  it('initializes with empty tracks and persists to localStorage', () => {
    const { useTracks } = loadWithPlatform('web', { initialMoney: 500 })

    expect(useTracks.getState().tracks).toEqual([])

    useTracks.getState().buyNextTrack('My Track')

    const stored = (global as any).localStorage.getItem('idle.tracks.v4')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":4')
    expect(stored).toContain('My Track')
  })

  it('loads initial state from localStorage on module init', () => {
    const track = {
      id: 'track_1',
      index: 0,
      name: 'Loaded Track',
      capacityLevel: 5,
      safetyLevel: 3,
      entertainmentLevel: 2,
    }
    const { useTracks } = loadWithPlatform('web', { seedTracks: [track] })

    expect(useTracks.getState().tracks.length).toBe(1)
    expect(useTracks.getState().tracks[0].name).toBe('Loaded Track')
    expect(useTracks.getState().tracks[0].capacityLevel).toBe(5)
  })

  it('persists state changes to localStorage', () => {
    const { useTracks } = loadWithPlatform('web', { initialMoney: 10000 })

    useTracks.getState().buyNextTrack('Track A')
    useTracks.getState().upgradeCapacityByMode('track_1', 'x1')

    const stored = (global as any).localStorage.getItem('idle.tracks.v4')
    const parsed = JSON.parse(stored)

    expect(parsed.state.tracks[0].capacityLevel).toBe(2)
  })

  it('supports reset to clear state in localStorage', () => {
    const track = {
      id: 'track_1',
      index: 0,
      name: 'Test Track',
      capacityLevel: 10,
      safetyLevel: 10,
      entertainmentLevel: 10,
    }
    const { useTracks } = loadWithPlatform('web', { seedTracks: [track] })

    expect(useTracks.getState().tracks.length).toBe(1)

    useTracks.getState().reset()
    expect(useTracks.getState().tracks).toEqual([])

    const stored = (global as any).localStorage.getItem('idle.tracks.v4')
    const parsed = JSON.parse(stored)
    expect(parsed.state.tracks).toEqual([])
  })

  it('upgrades update the track rating', () => {
    const { useTracks } = loadWithPlatform('web', { initialMoney: 100000 })

    useTracks.getState().buyNextTrack('Race Track')
    const initialRating = useTracks.getState().tracks[0].rating

    useTracks.getState().upgradeCapacityByMode('track_1', 'x10')
    const afterRating = useTracks.getState().tracks[0].rating

    expect(afterRating).toBeGreaterThan(initialRating)
  })
})
