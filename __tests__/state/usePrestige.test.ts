const STORE_IMPORT_PATH = '@state/usePrestige'

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

function loadWithPlatform(
  os: 'web' | 'ios' | 'android',
  opts?: { seedKnowledge?: number; seedTotalKnowledge?: number },
): { usePrestige: any } {
  jest.resetModules()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (opts?.seedKnowledge !== undefined || opts?.seedTotalKnowledge !== undefined) {
      const state = {
        knowledge: opts?.seedKnowledge ?? 0,
        totalKnowledge: opts?.seedTotalKnowledge ?? 0,
      }
      ;(global as any).localStorage.setItem(
        'idle.prestige.v1',
        JSON.stringify({ state, version: 1 }),
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
  const mockTracks: any[] = []
  jest.doMock('@state/useTracks', () => ({
    useTracks: {
      getState: () => ({
        tracks: mockTracks,
        reset: jest.fn(() => {
          mockTracks.length = 0
        }),
      }),
    },
  }))

  jest.doMock('@state/useMoney', () => ({
    useMoney: {
      getState: () => ({
        set: jest.fn(),
      }),
    },
  }))

  jest.doMock('@state/useEvents', () => ({
    useEvents: {
      getState: () => ({
        reset: jest.fn(),
      }),
    },
  }))

  let usePrestige: any
  // eslint-disable-next-line unused-imports/no-unused-vars
  let useTracks: any
  // eslint-disable-next-line unused-imports/no-unused-vars
  let useMoney: any

  jest.isolateModules(() => {
    usePrestige = require(STORE_IMPORT_PATH).usePrestige
    useTracks = require('@state/useTracks').useTracks
    useMoney = require('@state/useMoney').useMoney
  })

  return { usePrestige }
}

describe('usePrestige (native/app)', () => {
  it('initializes with zero knowledge', () => {
    const { usePrestige } = loadWithPlatform('ios')

    expect(usePrestige.getState().knowledge).toBe(0)
    expect(usePrestige.getState().totalKnowledge).toBe(0)
  })

  it('calculateKnowledge returns 0 for fewer than 500 total levels', () => {
    const { usePrestige } = loadWithPlatform('android')

    const calc = usePrestige.getState().calculateKnowledge()
    expect(calc).toBe(0)
  })

  it('calculateEarningsMultiplier starts at 1x with zero knowledge', () => {
    const { usePrestige } = loadWithPlatform('ios')

    const mult = usePrestige.getState().calculateEarningsMultiplier()
    expect(mult).toBe(1.0)
  })

  it('calculateEarningsMultiplier increases with totalKnowledge', () => {
    const { usePrestige } = loadWithPlatform('android')

    usePrestige.setState({ totalKnowledge: 100 })

    const mult = usePrestige.getState().calculateEarningsMultiplier()
    expect(mult).toBe(3.0) // 1 + (100 / 100) * 2 = 3
  })

  it('calculateEarningsMultiplier scales correctly with large totalKnowledge', () => {
    const { usePrestige } = loadWithPlatform('ios')

    usePrestige.setState({ totalKnowledge: 500 })

    const mult = usePrestige.getState().calculateEarningsMultiplier()
    expect(mult).toBe(11.0) // 1 + (500 / 100) * 2 = 11
  })

  it('supports reset to clear all knowledge', () => {
    const { usePrestige } = loadWithPlatform('android')

    usePrestige.setState({ knowledge: 50, totalKnowledge: 200 })

    expect(usePrestige.getState().knowledge).toBe(50)
    expect(usePrestige.getState().totalKnowledge).toBe(200)

    usePrestige.getState().reset()

    expect(usePrestige.getState().knowledge).toBe(0)
    expect(usePrestige.getState().totalKnowledge).toBe(0)
  })
})

describe('usePrestige (web)', () => {
  it('initializes with zero knowledge and persists to localStorage', () => {
    const { usePrestige } = loadWithPlatform('web')

    expect(usePrestige.getState().knowledge).toBe(0)
    expect(usePrestige.getState().totalKnowledge).toBe(0)

    usePrestige.setState({ totalKnowledge: 100 })

    const stored = (global as any).localStorage.getItem('idle.prestige.v1')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":1')
    expect(stored).toContain('"totalKnowledge":100')
  })

  it('loads initial state from localStorage on module init', () => {
    const { usePrestige } = loadWithPlatform('web', {
      seedKnowledge: 50,
      seedTotalKnowledge: 300,
    })

    expect(usePrestige.getState().knowledge).toBe(50)
    expect(usePrestige.getState().totalKnowledge).toBe(300)
  })

  it('persists state changes to localStorage', () => {
    const { usePrestige } = loadWithPlatform('web')

    usePrestige.setState({ knowledge: 25, totalKnowledge: 150 })

    const stored = (global as any).localStorage.getItem('idle.prestige.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.knowledge).toBe(25)
    expect(parsed.state.totalKnowledge).toBe(150)
  })

  it('supports reset to clear state in localStorage', () => {
    const { usePrestige } = loadWithPlatform('web', {
      seedKnowledge: 100,
      seedTotalKnowledge: 500,
    })

    expect(usePrestige.getState().totalKnowledge).toBe(500)

    usePrestige.getState().reset()

    expect(usePrestige.getState().knowledge).toBe(0)
    expect(usePrestige.getState().totalKnowledge).toBe(0)

    const stored = (global as any).localStorage.getItem('idle.prestige.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.knowledge).toBe(0)
    expect(parsed.state.totalKnowledge).toBe(0)
  })

  it('calculateEarningsMultiplier returns correct values', () => {
    const { usePrestige } = loadWithPlatform('web', { seedTotalKnowledge: 200 })

    const mult = usePrestige.getState().calculateEarningsMultiplier()
    expect(mult).toBe(5.0) // 1 + (200 / 100) * 2 = 5
  })
})
