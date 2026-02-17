const STORE_IMPORT_PATH = '@state/useMoney'

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
  opts?: { seedMoneyStr?: string },
): { useMoney: any; BN: any } {
  jest.resetModules()

  if (os === 'web') {
    ;(global as any).localStorage = makeLocalStorageMock()

    if (opts?.seedMoneyStr) {
      ;(global as any).localStorage.setItem(
        'idle.money.v1',
        JSON.stringify({ state: { money: opts.seedMoneyStr }, version: 1 }),
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

  let useMoney: any
  let BN: any

  jest.isolateModules(() => {
    BN = require('@utils/bignum').BN
    useMoney = require(STORE_IMPORT_PATH).useMoney
  })

  return { useMoney, BN }
}

describe('useMoney (native/app)', () => {
  it('supports add/remove/spend/canAfford/set/reset with huge numbers (1e100)', () => {
    const { useMoney, BN } = loadWithPlatform('ios')

    const huge = BN.from('1e100')
    const ten = BN.from(10)
    const fifty = BN.from(50)

    useMoney.getState().reset()
    expect(useMoney.getState().money.toString()).toBe(BN.zero().toString())

    useMoney.getState().set(huge)
    expect(useMoney.getState().money.toString()).toBe(huge.toString())

    expect(useMoney.getState().canAfford(huge)).toBe(true)

    const cur = useMoney.getState().money
    const more = BN.add(cur, cur)
    expect(useMoney.getState().canAfford(more)).toBe(false)

    expect(useMoney.getState().spend(fifty)).toBe(true)
    expect(useMoney.getState().money.toString()).toBe(BN.sub(huge, fifty).toString())

    const tooMuch = BN.add(useMoney.getState().money, useMoney.getState().money)
    expect(useMoney.getState().spend(tooMuch)).toBe(false)
    expect(useMoney.getState().money.toString()).toBe(BN.sub(huge, fifty).toString())

    useMoney.getState().add(ten)
    expect(useMoney.getState().money.toString()).toBe(BN.add(BN.sub(huge, fifty), ten).toString())

    useMoney.getState().remove(BN.from(25))
    expect(useMoney.getState().money.toString()).toBe(
      BN.sub(BN.add(BN.sub(huge, fifty), ten), BN.from(25)).toString(),
    )

    useMoney.getState().reset()
    useMoney.getState().remove(BN.from(999))
    expect(useMoney.getState().money.toString()).toBe(BN.zero().toString())
  })

  it('rejects invalid amounts (negative / non-finite) where applicable', () => {
    const { useMoney, BN } = loadWithPlatform('android')

    useMoney.getState().reset()
    useMoney.getState().set(BN.from(100))

    const neg = BN.from(-1)
    const nan = BN.from(NaN as any)

    expect(useMoney.getState().spend(neg)).toBe(false)
    expect(useMoney.getState().canAfford(neg)).toBe(false)

    useMoney.getState().add(nan)
    useMoney.getState().remove(nan)
    useMoney.getState().set(nan)

    expect(useMoney.getState().money.toString()).toBe(BN.from(100).toString())
  })
})

describe('useMoney (web)', () => {
  it('supports add/remove/spend/canAfford/set/reset with huge numbers (1e100) and persists to localStorage', () => {
    const { useMoney, BN } = loadWithPlatform('web')

    const huge = BN.from('1e100')
    const one = BN.from(1)
    const fifty = BN.from(50)

    useMoney.getState().reset()
    expect(useMoney.getState().money.toString()).toBe(BN.zero().toString())

    useMoney.getState().set(huge)
    expect(useMoney.getState().money.toString()).toBe(huge.toString())

    const stored = (global as any).localStorage.getItem('idle.money.v1')
    expect(typeof stored).toBe('string')
    expect(stored).toContain('"version":1')

    expect(useMoney.getState().canAfford(huge)).toBe(true)

    const cur = useMoney.getState().money
    const more = BN.add(cur, cur)
    expect(useMoney.getState().canAfford(more)).toBe(false)

    expect(useMoney.getState().spend(fifty)).toBe(true)
    expect(useMoney.getState().money.toString()).toBe(BN.sub(huge, fifty).toString())

    const tooMuch = BN.add(useMoney.getState().money, useMoney.getState().money)
    expect(useMoney.getState().spend(tooMuch)).toBe(false)
    expect(useMoney.getState().money.toString()).toBe(BN.sub(huge, fifty).toString())

    useMoney.getState().add(one)
    expect(useMoney.getState().money.toString()).toBe(BN.add(BN.sub(huge, fifty), one).toString())

    useMoney.getState().remove(BN.from(25))
    expect(useMoney.getState().money.toString()).toBe(
      BN.sub(BN.add(BN.sub(huge, fifty), one), BN.from(25)).toString(),
    )

    useMoney.getState().reset()
    useMoney.getState().remove(BN.from(999))
    expect(useMoney.getState().money.toString()).toBe(BN.zero().toString())
  })

  it('loads initial state from localStorage on module init', () => {
    const seededStr = '1e100'
    const { useMoney, BN } = loadWithPlatform('web', { seedMoneyStr: seededStr })
    expect(useMoney.getState().money.toString()).toBe(BN.from(seededStr).toString())
  })
})
