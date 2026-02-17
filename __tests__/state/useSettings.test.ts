const STORE_IMPORT_PATH = '@state/useSettings'

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
  opts?: {
    seedEnlargedLeader?: boolean
    seedEnableAds?: boolean
    seedSpeedVariance?: number
    seedMaxCarCount?: number
  },
): { useSettings: any } {
  jest.resetModules()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (
      opts?.seedEnlargedLeader !== undefined ||
      opts?.seedEnableAds !== undefined ||
      opts?.seedSpeedVariance !== undefined ||
      opts?.seedMaxCarCount !== undefined
    ) {
      const state = {
        enlargedLeader: opts?.seedEnlargedLeader ?? false,
        enableAds: opts?.seedEnableAds ?? true,
        speedVariance: opts?.seedSpeedVariance ?? 12,
        maxCarCount: opts?.seedMaxCarCount ?? 20,
      }
      ;(global as any).localStorage.setItem(
        'idle.settings.v1',
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

  let useSettings: any

  jest.isolateModules(() => {
    useSettings = require(STORE_IMPORT_PATH).useSettings
  })

  return { useSettings }
}

describe('useSettings (native/app)', () => {
  it('initializes with default state', () => {
    const { useSettings } = loadWithPlatform('ios')

    expect(useSettings.getState().enlargedLeader).toBe(false)
    expect(useSettings.getState().enableAds).toBe(true)
    expect(useSettings.getState().speedVariance).toBe(12)
    expect(useSettings.getState().maxCarCount).toBe(20)
  })

  it('supports setEnlargedLeader to toggle enlarged leader setting', () => {
    const { useSettings } = loadWithPlatform('android')

    expect(useSettings.getState().enlargedLeader).toBe(false)

    useSettings.getState().setEnlargedLeader(true)
    expect(useSettings.getState().enlargedLeader).toBe(true)

    useSettings.getState().setEnlargedLeader(false)
    expect(useSettings.getState().enlargedLeader).toBe(false)
  })

  it('supports setEnableAds to toggle ads setting', () => {
    const { useSettings } = loadWithPlatform('ios')

    expect(useSettings.getState().enableAds).toBe(true)

    useSettings.getState().setEnableAds(false)
    expect(useSettings.getState().enableAds).toBe(false)

    useSettings.getState().setEnableAds(true)
    expect(useSettings.getState().enableAds).toBe(true)
  })

  it('supports setSpeedVariance with clamping and rounding', () => {
    const { useSettings } = loadWithPlatform('android')

    expect(useSettings.getState().speedVariance).toBe(12)

    useSettings.getState().setSpeedVariance(50)
    expect(useSettings.getState().speedVariance).toBe(50)

    useSettings.getState().setSpeedVariance(50.7)
    expect(useSettings.getState().speedVariance).toBe(51)

    useSettings.getState().setSpeedVariance(-10)
    expect(useSettings.getState().speedVariance).toBe(0)

    useSettings.getState().setSpeedVariance(150)
    expect(useSettings.getState().speedVariance).toBe(100)
  })

  it('supports resetSpeedVariance to restore default', () => {
    const { useSettings } = loadWithPlatform('ios')

    useSettings.getState().setSpeedVariance(75)
    expect(useSettings.getState().speedVariance).toBe(75)

    useSettings.getState().resetSpeedVariance()
    expect(useSettings.getState().speedVariance).toBe(12)
  })

  it('supports setMaxCarCount with clamping and rounding', () => {
    const { useSettings } = loadWithPlatform('android')

    expect(useSettings.getState().maxCarCount).toBe(20)

    useSettings.getState().setMaxCarCount(50)
    expect(useSettings.getState().maxCarCount).toBe(50)

    useSettings.getState().setMaxCarCount(50.9)
    expect(useSettings.getState().maxCarCount).toBe(51)

    useSettings.getState().setMaxCarCount(2)
    expect(useSettings.getState().maxCarCount).toBe(5)

    useSettings.getState().setMaxCarCount(200)
    expect(useSettings.getState().maxCarCount).toBe(100)
  })

  it('supports resetMaxCarCount to restore default', () => {
    const { useSettings } = loadWithPlatform('ios')

    useSettings.getState().setMaxCarCount(75)
    expect(useSettings.getState().maxCarCount).toBe(75)

    useSettings.getState().resetMaxCarCount()
    expect(useSettings.getState().maxCarCount).toBe(20)
  })

  it('supports reset to restore all defaults', () => {
    const { useSettings } = loadWithPlatform('android')

    useSettings.getState().setEnlargedLeader(true)
    useSettings.getState().setEnableAds(false)
    useSettings.getState().setSpeedVariance(80)
    useSettings.getState().setMaxCarCount(60)

    expect(useSettings.getState().enlargedLeader).toBe(true)
    expect(useSettings.getState().enableAds).toBe(false)

    useSettings.getState().reset()

    expect(useSettings.getState().enlargedLeader).toBe(false)
    expect(useSettings.getState().enableAds).toBe(true)
    expect(useSettings.getState().speedVariance).toBe(12)
    expect(useSettings.getState().maxCarCount).toBe(20)
  })
})

describe('useSettings (web)', () => {
  it('initializes with default state and persists to localStorage', () => {
    const { useSettings } = loadWithPlatform('web')

    expect(useSettings.getState().enlargedLeader).toBe(false)
    expect(useSettings.getState().enableAds).toBe(true)
    expect(useSettings.getState().speedVariance).toBe(12)
    expect(useSettings.getState().maxCarCount).toBe(20)

    useSettings.getState().setSpeedVariance(25)

    const stored = (global as any).localStorage.getItem('idle.settings.v1')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":1')
    expect(stored).toContain('"speedVariance":25')
  })

  it('loads initial state from localStorage on module init', () => {
    const { useSettings } = loadWithPlatform('web', {
      seedEnlargedLeader: true,
      seedEnableAds: false,
      seedSpeedVariance: 75,
      seedMaxCarCount: 50,
    })

    expect(useSettings.getState().enlargedLeader).toBe(true)
    expect(useSettings.getState().enableAds).toBe(false)
    expect(useSettings.getState().speedVariance).toBe(75)
    expect(useSettings.getState().maxCarCount).toBe(50)
  })

  it('persists state changes to localStorage', () => {
    const { useSettings } = loadWithPlatform('web')

    useSettings.getState().setEnlargedLeader(true)
    useSettings.getState().setEnableAds(false)
    useSettings.getState().setSpeedVariance(40)
    useSettings.getState().setMaxCarCount(30)

    const stored = (global as any).localStorage.getItem('idle.settings.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.enlargedLeader).toBe(true)
    expect(parsed.state.enableAds).toBe(false)
    expect(parsed.state.speedVariance).toBe(40)
    expect(parsed.state.maxCarCount).toBe(30)
  })

  it('supports reset to restore defaults in localStorage', () => {
    const { useSettings } = loadWithPlatform('web', {
      seedEnlargedLeader: true,
      seedSpeedVariance: 90,
    })

    useSettings.getState().reset()

    expect(useSettings.getState().enlargedLeader).toBe(false)
    expect(useSettings.getState().speedVariance).toBe(12)

    const stored = (global as any).localStorage.getItem('idle.settings.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.enlargedLeader).toBe(false)
    expect(parsed.state.speedVariance).toBe(12)
  })
})
