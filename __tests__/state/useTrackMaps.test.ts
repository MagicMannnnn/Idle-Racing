const STORE_IMPORT_PATH = '@state/useTrackMaps'

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
  opts?: { seedMaps?: any },
): { useTrackMaps: any } {
  jest.resetModules()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (opts?.seedMaps) {
      ;(global as any).localStorage.setItem(
        'idle.trackmaps.v13',
        JSON.stringify({ state: opts.seedMaps, version: 1 }),
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

  let useTrackMaps: any

  jest.isolateModules(() => {
    useTrackMaps = require(STORE_IMPORT_PATH).useTrackMaps
  })

  return { useTrackMaps }
}

describe('useTrackMaps (native/app)', () => {
  it('initializes with empty state', () => {
    const { useTrackMaps } = loadWithPlatform('ios')

    expect(useTrackMaps.getState().byTrackId).toEqual({})
    expect(useTrackMaps.getState().get('track_1')).toBeUndefined()
  })

  it('supports ensure to create a default oval for a track', () => {
    const { useTrackMaps } = loadWithPlatform('android')

    useTrackMaps.getState().ensure('track_1', 5)

    const grid = useTrackMaps.getState().get('track_1')
    expect(grid).toBeDefined()
    expect(grid.size).toBe(5)
    expect(grid.cells.length).toBe(25)
    expect(typeof grid.updatedAt).toBe('number')
  })

  it('does not overwrite existing grid when ensure is called again', () => {
    const { useTrackMaps } = loadWithPlatform('ios')

    useTrackMaps.getState().ensure('track_1', 5)
    const grid1 = useTrackMaps.getState().get('track_1')

    useTrackMaps.getState().ensure('track_1', 7)
    const grid2 = useTrackMaps.getState().get('track_1')

    expect(grid1).toBe(grid2)
    expect(grid2.size).toBe(5)
  })

  it('supports setSize to regenerate grid with new size', () => {
    const { useTrackMaps } = loadWithPlatform('android')

    useTrackMaps.getState().ensure('track_1', 5)
    expect(useTrackMaps.getState().get('track_1').size).toBe(5)

    useTrackMaps.getState().setSize('track_1', 7)
    expect(useTrackMaps.getState().get('track_1').size).toBe(7)
    expect(useTrackMaps.getState().get('track_1').cells.length).toBe(49)
  })

  it('ensures size is odd and at least 3', () => {
    const { useTrackMaps } = loadWithPlatform('ios')

    useTrackMaps.getState().setSize('track_1', 2)
    expect(useTrackMaps.getState().get('track_1').size).toBe(3)

    useTrackMaps.getState().setSize('track_1', 6)
    expect(useTrackMaps.getState().get('track_1').size).toBe(7)
  })

  it('supports setCell to change individual cells', () => {
    const { useTrackMaps } = loadWithPlatform('android')

    useTrackMaps.getState().ensure('track_1', 5)
    const beforeUpdatedAt = useTrackMaps.getState().get('track_1').updatedAt

    useTrackMaps.getState().setCell('track_1', 2, 2, 'track')
    const grid = useTrackMaps.getState().get('track_1')
    const idx = 2 * 5 + 2
    expect(grid.cells[idx]).toBe('track')
    expect(grid.updatedAt).toBeGreaterThanOrEqual(beforeUpdatedAt)
  })

  it('prevents setting stand on non-empty cells', () => {
    const { useTrackMaps } = loadWithPlatform('ios')

    useTrackMaps.getState().ensure('track_1', 5)
    useTrackMaps.getState().setCell('track_1', 2, 2, 'infield')

    const beforeCells = useTrackMaps.getState().get('track_1').cells.slice()
    useTrackMaps.getState().setCell('track_1', 2, 2, 'stand')

    const afterCells = useTrackMaps.getState().get('track_1').cells
    expect(afterCells).toEqual(beforeCells)
  })

  it('supports setCells to replace entire grid', () => {
    const { useTrackMaps } = loadWithPlatform('android')

    useTrackMaps.getState().ensure('track_1', 5)
    const newCells = new Array(25).fill('empty')
    newCells[12] = 'track'

    useTrackMaps.getState().setCells('track_1', newCells as any)
    const grid = useTrackMaps.getState().get('track_1')
    expect(grid.cells[12]).toBe('track')
  })

  it('strips stand cells when using setCells', () => {
    const { useTrackMaps } = loadWithPlatform('ios')

    useTrackMaps.getState().ensure('track_1', 5)
    const newCells = new Array(25).fill('empty')
    newCells[5] = 'stand'

    useTrackMaps.getState().setCells('track_1', newCells as any)
    const grid = useTrackMaps.getState().get('track_1')
    expect(grid.cells[5]).toBe('empty')
  })

  it('supports setCarName to store custom car names', () => {
    const { useTrackMaps } = loadWithPlatform('android')

    useTrackMaps.getState().setCarName(0, 'Lightning McQueen')
    useTrackMaps.getState().setCarName(1, 'Mater', 95)

    const names = useTrackMaps.getState().getCarNames()
    const numbers = useTrackMaps.getState().getCarNumbers()

    expect(names[0]).toBe('Lightning McQueen')
    expect(names[1]).toBe('Mater')
    expect(numbers[1]).toBe(95)
  })

  it('supports clear to regenerate default oval', () => {
    const { useTrackMaps } = loadWithPlatform('ios')

    useTrackMaps.getState().ensure('track_1', 5)
    useTrackMaps.getState().setCell('track_1', 2, 2, 'track')

    const before = useTrackMaps.getState().get('track_1')
    const idx = 2 * 5 + 2
    expect(before.cells[idx]).toBe('track')

    useTrackMaps.getState().clear('track_1')
    const after = useTrackMaps.getState().get('track_1')
    expect(after.size).toBe(5)
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt)
  })

  it('supports resetAll to clear all track maps', () => {
    const { useTrackMaps } = loadWithPlatform('android')

    useTrackMaps.getState().ensure('track_1', 5)
    useTrackMaps.getState().ensure('track_2', 7)

    expect(Object.keys(useTrackMaps.getState().byTrackId).length).toBe(2)

    useTrackMaps.getState().resetAll()
    expect(useTrackMaps.getState().byTrackId).toEqual({})
  })
})

describe('useTrackMaps (web)', () => {
  it('initializes with empty state and persists to localStorage', () => {
    const { useTrackMaps } = loadWithPlatform('web')

    expect(useTrackMaps.getState().byTrackId).toEqual({})

    useTrackMaps.getState().ensure('track_1', 5)

    const stored = (global as any).localStorage.getItem('idle.trackmaps.v13')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":1')
    expect(stored).toContain('track_1')
  })

  it('loads initial state from localStorage on module init', () => {
    const grid = {
      size: 5,
      cells: new Array(25).fill('infield'),
      updatedAt: Date.now(),
    }
    const { useTrackMaps } = loadWithPlatform('web', {
      seedMaps: { byTrackId: { track_1: grid }, carNames: ['TestCar'], carNumbers: [42] },
    })

    expect(useTrackMaps.getState().get('track_1')).toBeDefined()
    expect(useTrackMaps.getState().get('track_1').size).toBe(5)
    expect(useTrackMaps.getState().getCarNames()[0]).toBe('TestCar')
    expect(useTrackMaps.getState().getCarNumbers()[0]).toBe(42)
  })

  it('persists state changes to localStorage', () => {
    const { useTrackMaps } = loadWithPlatform('web')

    useTrackMaps.getState().ensure('track_1', 5)
    useTrackMaps.getState().setCell('track_1', 1, 1, 'track')
    useTrackMaps.getState().setCarName(0, 'TestCar', 99)

    const stored = (global as any).localStorage.getItem('idle.trackmaps.v13')
    const parsed = JSON.parse(stored)

    expect(parsed.state.byTrackId.track_1).toBeDefined()
    expect(parsed.state.carNames[0]).toBe('TestCar')
    expect(parsed.state.carNumbers[0]).toBe(99)
  })

  it('supports resetAll to clear state in localStorage', () => {
    const grid = {
      size: 5,
      cells: new Array(25).fill('infield'),
      updatedAt: Date.now(),
    }
    const { useTrackMaps } = loadWithPlatform('web', {
      seedMaps: { byTrackId: { track_1: grid }, carNames: [], carNumbers: [] },
    })

    expect(Object.keys(useTrackMaps.getState().byTrackId).length).toBe(1)

    useTrackMaps.getState().resetAll()
    expect(useTrackMaps.getState().byTrackId).toEqual({})

    const stored = (global as any).localStorage.getItem('idle.trackmaps.v13')
    const parsed = JSON.parse(stored)
    expect(parsed.state.byTrackId).toEqual({})
  })
})
