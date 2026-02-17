import { Platform } from 'react-native'
import { useReducer, useEffect } from 'react'
import Decimal from 'break_infinity.js'
import { BN, clamp0, type BigNum } from '@/src/utils/bignum'

type MoneyState = {
  money: Decimal
  add: (amount: BigNum) => void
  remove: (amount: BigNum) => void
  spend: (amount: BigNum) => boolean
  canAfford: (amount: BigNum) => boolean
  set: (amount: BigNum) => void
  reset: () => void
}

const valid = (n: BigNum) => BN.isFinite(n) && BN.gte(n, 0)

const STORAGE_KEY = 'idle.money.v1'

let useMoney: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = { money: BN.zero() }
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        state.money = BN.from(parsed.state?.money ?? 0)
      }
    } catch (e) {
      console.error('Failed to load money state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: { money: BN.toString(state.money) }, version: 1 }),
      )
    } catch (e) {
      console.error('Failed to save money state', e)
    }
  }

  const notify = () => {
    saveToStorage()
    listeners.forEach((fn) => fn())
  }

  loadFromStorage()

  const actions: MoneyState = {
    money: state.money,
    add: (amount) => {
      if (!BN.isFinite(amount)) return
      state.money = clamp0(BN.add(state.money, amount))
      notify()
    },
    remove: (amount) => {
      if (!BN.isFinite(amount)) return
      state.money = clamp0(BN.sub(state.money, amount))
      notify()
    },
    spend: (amount) => {
      if (!valid(amount)) return false
      if (BN.lt(state.money, amount)) return false
      state.money = BN.sub(state.money, amount)
      notify()
      return true
    },
    canAfford: (amount) => {
      if (!valid(amount)) return false
      return BN.gte(state.money, amount)
    },
    set: (amount) => {
      if (!BN.isFinite(amount)) return
      state.money = clamp0(amount)
      notify()
    },
    reset: () => {
      state.money = BN.zero()
      notify()
    },
  }

  const useMoneyWeb: any = (selector?: (state: MoneyState) => any) => {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])
    const fullState = { ...actions, money: state.money }
    return selector ? selector(fullState) : fullState
  }

  useMoneyWeb.getState = () => ({ ...actions, money: state.money })
  useMoneyWeb.setState = (partial: Partial<{ money: BigNum }>) => {
    if ('money' in partial) state.money = BN.from(partial.money!)
    notify()
  }

  useMoney = useMoneyWeb
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { persist, createJSONStorage } = require('zustand/middleware') as any

  useMoney = create()(
    persist(
      (set: any, get: any) => ({
        money: BN.zero(),

        add: (amount: BigNum) => {
          if (!BN.isFinite(amount)) return
          set((s: any) => ({ money: clamp0(BN.add(s.money, amount)) }))
        },

        remove: (amount: BigNum) => {
          if (!BN.isFinite(amount)) return
          set((s: any) => ({ money: clamp0(BN.sub(s.money, amount)) }))
        },

        spend: (amount: BigNum) => {
          if (!valid(amount)) return false
          const cur = get().money
          if (BN.lt(cur, amount)) return false
          set({ money: BN.sub(cur, amount) })
          return true
        },

        canAfford: (amount: BigNum) => {
          if (!valid(amount)) return false
          return BN.gte(get().money, amount)
        },

        set: (amount: BigNum) => {
          if (!BN.isFinite(amount)) return
          set({ money: clamp0(amount) })
        },

        reset: () => set({ money: BN.zero() }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage, {
          serialize: (state: any) =>
            JSON.stringify({ ...state, state: { money: BN.toString(state.state.money) } }),
          deserialize: (str: string) => {
            const parsed = JSON.parse(str)
            return { ...parsed, state: { money: BN.from(parsed.state.money) } }
          },
        }),
        version: 1,
      },
    ),
  )
}

export { useMoney }
