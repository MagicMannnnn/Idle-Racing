const STORE_IMPORT_PATH = '@state/useEvents'

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

const mockTracks = [
  {
    id: 'track_1',
    capacity: 100,
    maxCapacity: 200,
    trackSize: 10,
    rating: 3.5,
  },
  {
    id: 'track_2',
    capacity: 150,
    maxCapacity: 300,
    trackSize: 15,
    rating: 4.0,
  },
]

function loadWithPlatform(
  os: 'web' | 'ios' | 'android',
  opts?: { seedEvents?: any },
): { useEvents: any } {
  jest.resetModules()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (opts?.seedEvents) {
      ;(global as any).localStorage.setItem(
        'idle.events.simple.v1',
        JSON.stringify({ state: opts.seedEvents, version: 1 }),
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

  // Mock dependencies
  jest.doMock('@state/useTracks', () => ({
    useTracks: {
      getState: () => ({
        tracks: mockTracks,
      }),
    },
  }))

  jest.doMock('@state/useMoney', () => ({
    useMoney: {
      getState: () => ({
        add: jest.fn(),
      }),
    },
  }))

  jest.doMock('@state/usePrestige', () => ({
    usePrestige: {
      getState: () => ({
        calculateEarningsMultiplier: () => 1.0,
      }),
    },
  }))

  let useEvents: any

  jest.isolateModules(() => {
    useEvents = require(STORE_IMPORT_PATH).useEvents
  })

  return { useEvents }
}

describe('useEvents (native/app)', () => {
  beforeEach(() => {
    const g = globalThis as any
    if (g.__eventsTickerId) {
      clearInterval(g.__eventsTickerId)
      g.__eventsTickerId = null
    }
  })

  afterEach(() => {
    const g = globalThis as any
    if (g.__eventsTickerId) {
      clearInterval(g.__eventsTickerId)
      g.__eventsTickerId = null
    }
  })

  it('initializes with empty state', () => {
    const { useEvents } = loadWithPlatform('ios')

    expect(useEvents.getState().activeByTrack).toEqual({})
    expect(useEvents.getState().cooldownUntilByTrack).toEqual({})
  })

  it('supports startTrackDay to start a new event', () => {
    const { useEvents } = loadWithPlatform('android')

    const result = useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)

    expect(result.ok).toBe(true)

    const active = useEvents.getState().getActive('track_1')
    expect(active).toBeDefined()
    expect(active.trackId).toBe('track_1')
    expect(active.eventType).toBe('open_track_day')
    expect(active.runtimeMs).toBe(60000)
    expect(active.earningsMultiplier).toBe(1.0)
  })

  it('startTrackDay fails if track already has running event', () => {
    const { useEvents } = loadWithPlatform('ios')

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    const result = useEvents.getState().startTrackDay('track_1', 30000, 'open_track_day', 1.0)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('already_running')
  })

  it('startTrackDay fails if track not found', () => {
    const { useEvents } = loadWithPlatform('android')

    const result = useEvents.getState().startTrackDay('track_999', 60000, 'open_track_day', 1.0)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('track_not_found')
  })

  it('supports stopTrackDay to end an event early', () => {
    const { useEvents } = loadWithPlatform('ios')

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    expect(useEvents.getState().getActive('track_1')).toBeDefined()

    const result = useEvents.getState().stopTrackDay('track_1')

    expect(result.ok).toBe(true)
    expect(useEvents.getState().getActive('track_1')).toBeUndefined()
  })

  it('stopTrackDay fails if track has no running event', () => {
    const { useEvents } = loadWithPlatform('android')

    const result = useEvents.getState().stopTrackDay('track_1')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not_running')
  })

  it('stopTrackDay sets cooldown for the track', () => {
    const { useEvents } = loadWithPlatform('ios')

    const now = Date.now()
    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    useEvents.getState().stopTrackDay('track_1')

    const cooldown = useEvents.getState().getCooldownRemainingMs('track_1', 'open_track_day', now)
    expect(cooldown).toBeGreaterThan(0)
  })

  it('supports isTrackLocked to check if track can start event', () => {
    const { useEvents } = loadWithPlatform('android')

    expect(useEvents.getState().isTrackLocked('track_1', 'open_track_day')).toBe(false)

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    expect(useEvents.getState().isTrackLocked('track_1', 'open_track_day')).toBe(true)
  })

  it('isTrackLocked returns true during cooldown', () => {
    const { useEvents } = loadWithPlatform('ios')

    const now = Date.now()
    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    useEvents.getState().stopTrackDay('track_1')

    expect(useEvents.getState().isTrackLocked('track_1', 'open_track_day', now + 1000)).toBe(true)
  })

  it('supports getCooldownRemainingMs to check cooldown time', () => {
    const { useEvents } = loadWithPlatform('android')

    expect(useEvents.getState().getCooldownRemainingMs('track_1', 'open_track_day')).toBe(0)

    const now = Date.now()
    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    useEvents.getState().stopTrackDay('track_1')

    const remaining = useEvents.getState().getCooldownRemainingMs('track_1', 'open_track_day', now)
    expect(remaining).toBeGreaterThan(0)
  })

  it('supports setIncomeBoost to toggle 2x income', () => {
    const { useEvents } = loadWithPlatform('ios')

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)

    const result = useEvents.getState().setIncomeBoost('track_1', true)
    expect(result.ok).toBe(true)

    const active = useEvents.getState().getActive('track_1')
    expect(active.incomeX2).toBe(true)
  })

  it('setIncomeBoost fails if track has no running event', () => {
    const { useEvents } = loadWithPlatform('android')

    const result = useEvents.getState().setIncomeBoost('track_1', true)

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('not_running')
  })

  it('supports getActive to retrieve active event for track', () => {
    const { useEvents } = loadWithPlatform('ios')

    expect(useEvents.getState().getActive('track_1')).toBeUndefined()

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.5)

    const active = useEvents.getState().getActive('track_1')
    expect(active).toBeDefined()
    expect(active.earningsMultiplier).toBe(1.5)
  })

  it('supports reset to clear all events and cooldowns', () => {
    const { useEvents } = loadWithPlatform('android')

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    useEvents.getState().startTrackDay('track_2', 30000, 'closed_testing', 2.0)

    expect(Object.keys(useEvents.getState().activeByTrack).length).toBe(2)

    useEvents.getState().reset()

    expect(useEvents.getState().activeByTrack).toEqual({})
    expect(useEvents.getState().cooldownUntilByTrack).toEqual({})
  })

  it('cooldown groups work correctly for different event types', () => {
    const { useEvents } = loadWithPlatform('ios')

    // Start and stop an open_track_day
    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    useEvents.getState().stopTrackDay('track_1')

    // closed_testing is in same cooldown group (track_day)
    expect(useEvents.getState().isTrackLocked('track_1', 'closed_testing')).toBe(true)

    // club_race_day is in different cooldown group
    // So it should not be locked
    expect(useEvents.getState().isTrackLocked('track_1', 'club_race_day')).toBe(false)
  })

  it('multiple tracks can have events simultaneously', () => {
    const { useEvents } = loadWithPlatform('android')

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)
    useEvents.getState().startTrackDay('track_2', 30000, 'closed_testing', 2.0)

    expect(useEvents.getState().getActive('track_1')).toBeDefined()
    expect(useEvents.getState().getActive('track_2')).toBeDefined()
  })
})

describe('useEvents (web)', () => {
  beforeEach(() => {
    const g = globalThis as any
    if (g.__eventsTickerId) {
      clearInterval(g.__eventsTickerId)
      g.__eventsTickerId = null
    }
  })

  afterEach(() => {
    const g = globalThis as any
    if (g.__eventsTickerId) {
      clearInterval(g.__eventsTickerId)
      g.__eventsTickerId = null
    }
  })

  it('initializes with empty state and persists to localStorage', () => {
    const { useEvents } = loadWithPlatform('web')

    expect(useEvents.getState().activeByTrack).toEqual({})

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)

    const stored = (global as any).localStorage.getItem('idle.events.simple.v1')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":1')
    expect(stored).toContain('track_1')
  })

  it('loads initial state from localStorage on module init', () => {
    const now = Date.now()
    const event = {
      trackId: 'track_1',
      eventType: 'open_track_day',
      earningsMultiplier: 1.5,
      startedAt: now,
      endsAt: now + 60000,
      lastTickAt: now,
      runtimeMs: 60000,
      carry: 0,
      earntLastTick: 0,
      total: 0,
      incomeX2: false,
      seed: 12345,
      snapshotCapacity: 100,
      snapshotTrackSize: 10,
      snapshotRating: 3.5,
    }

    const { useEvents } = loadWithPlatform('web', {
      seedEvents: { activeByTrack: { track_1: event }, cooldownUntilByTrack: {} },
    })

    const active = useEvents.getState().getActive('track_1')
    expect(active).toBeDefined()
    expect(active.eventType).toBe('open_track_day')
    expect(active.earningsMultiplier).toBe(1.5)
  })

  it('persists state changes to localStorage', () => {
    const { useEvents } = loadWithPlatform('web')

    useEvents.getState().startTrackDay('track_1', 60000, 'club_race_day', 1.5)
    useEvents.getState().setIncomeBoost('track_1', true)

    const stored = (global as any).localStorage.getItem('idle.events.simple.v1')
    const parsed = JSON.parse(stored)

    expect(parsed.state.activeByTrack.track_1).toBeDefined()
    expect(parsed.state.activeByTrack.track_1.incomeX2).toBe(true)
    expect(parsed.state.activeByTrack.track_1.eventType).toBe('club_race_day')
  })

  it('supports reset to clear state in localStorage', () => {
    const { useEvents } = loadWithPlatform('web')

    useEvents.getState().startTrackDay('track_1', 60000, 'open_track_day', 1.0)

    expect(Object.keys(useEvents.getState().activeByTrack).length).toBe(1)

    useEvents.getState().reset()

    expect(useEvents.getState().activeByTrack).toEqual({})

    const stored = (global as any).localStorage.getItem('idle.events.simple.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.activeByTrack).toEqual({})
  })

  it('stopTrackDay persists cooldowns to localStorage', () => {
    const { useEvents } = loadWithPlatform('web')

    useEvents.getState().startTrackDay('track_1', 60000, 'national_race_day', 1.0)
    useEvents.getState().stopTrackDay('track_1')

    const stored = (global as any).localStorage.getItem('idle.events.simple.v1')
    const parsed = JSON.parse(stored)

    expect(parsed.state.cooldownUntilByTrack.track_1).toBeDefined()
    expect(parsed.state.cooldownUntilByTrack.track_1.national).toBeGreaterThan(0)
  })
})
