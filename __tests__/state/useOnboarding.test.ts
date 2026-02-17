const STORE_IMPORT_PATH = '@state/useOnboarding'

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
  opts?: { seedCompleted?: boolean; seedStage?: number },
): { useOnboarding: any } {
  jest.resetModules()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (opts?.seedCompleted !== undefined || opts?.seedStage !== undefined) {
      const state = {
        completed: opts?.seedCompleted ?? false,
        stage: opts?.seedStage ?? 0,
      }
      ;(global as any).localStorage.setItem(
        'idle.onboarding.v1',
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

  let useOnboarding: any

  jest.isolateModules(() => {
    useOnboarding = require(STORE_IMPORT_PATH).useOnboarding
  })

  return { useOnboarding }
}

describe('useOnboarding (native/app)', () => {
  it('initializes with default state (not completed, stage 0)', () => {
    const { useOnboarding } = loadWithPlatform('ios')

    expect(useOnboarding.getState().completed).toBe(false)
    expect(useOnboarding.getState().stage).toBe(0)
  })

  it('supports setStage to change the current stage', () => {
    const { useOnboarding } = loadWithPlatform('android')

    expect(useOnboarding.getState().stage).toBe(0)

    useOnboarding.getState().setStage(3)
    expect(useOnboarding.getState().stage).toBe(3)

    useOnboarding.getState().setStage(10)
    expect(useOnboarding.getState().stage).toBe(10)
  })

  it('supports complete to mark onboarding as done and reset stage', () => {
    const { useOnboarding } = loadWithPlatform('ios')

    useOnboarding.getState().setStage(5)
    expect(useOnboarding.getState().completed).toBe(false)
    expect(useOnboarding.getState().stage).toBe(5)

    useOnboarding.getState().complete()
    expect(useOnboarding.getState().completed).toBe(true)
    expect(useOnboarding.getState().stage).toBe(0)
  })

  it('supports reset to clear all onboarding state', () => {
    const { useOnboarding } = loadWithPlatform('android')

    useOnboarding.getState().setStage(5)
    useOnboarding.getState().complete()
    expect(useOnboarding.getState().completed).toBe(true)

    useOnboarding.getState().reset()
    expect(useOnboarding.getState().completed).toBe(false)
    expect(useOnboarding.getState().stage).toBe(0)
  })
})

describe('useOnboarding (web)', () => {
  it('initializes with default state and persists to localStorage', () => {
    const { useOnboarding } = loadWithPlatform('web')

    expect(useOnboarding.getState().completed).toBe(false)
    expect(useOnboarding.getState().stage).toBe(0)

    useOnboarding.getState().setStage(2)

    const stored = (global as any).localStorage.getItem('idle.onboarding.v1')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":1')
    expect(stored).toContain('"stage":2')
  })

  it('loads initial state from localStorage on module init', () => {
    const { useOnboarding } = loadWithPlatform('web', { seedCompleted: true, seedStage: 7 })

    expect(useOnboarding.getState().completed).toBe(true)
    expect(useOnboarding.getState().stage).toBe(7)
  })

  it('persists state changes to localStorage', () => {
    const { useOnboarding } = loadWithPlatform('web')

    useOnboarding.getState().setStage(5)
    useOnboarding.getState().complete()

    const stored = (global as any).localStorage.getItem('idle.onboarding.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.completed).toBe(true)
    expect(parsed.state.stage).toBe(0)
  })

  it('supports reset to clear state in localStorage', () => {
    const { useOnboarding } = loadWithPlatform('web', { seedCompleted: true, seedStage: 10 })

    expect(useOnboarding.getState().completed).toBe(true)

    useOnboarding.getState().reset()
    expect(useOnboarding.getState().completed).toBe(false)
    expect(useOnboarding.getState().stage).toBe(0)

    const stored = (global as any).localStorage.getItem('idle.onboarding.v1')
    const parsed = JSON.parse(stored)
    expect(parsed.state.completed).toBe(false)
    expect(parsed.state.stage).toBe(0)
  })
})
