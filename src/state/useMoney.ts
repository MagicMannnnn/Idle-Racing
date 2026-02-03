import { Platform } from 'react-native'
import { useReducer, useEffect } from 'react'

type MoneyState = {
  money: number
  add: (amount: number) => void
  remove: (amount: number) => void
  spend: (amount: number) => boolean
  canAfford: (amount: number) => boolean
  set: (amount: number) => void
  reset: () => void
}

const clamp0 = (n: number) => (n < 0 ? 0 : n)
const valid = (n: number) => Number.isFinite(n) && n >= 0

const STORAGE_KEY = 'idle.money.v1'

let useMoney: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = { money: 0 }
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        state.money = parsed.state?.money ?? 0
      }
    } catch (e) {
      console.error('Failed to load money state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ state: { money: state.money }, version: 1 }),
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
      if (!Number.isFinite(amount)) return
      state.money = clamp0(state.money + amount)
      notify()
    },
    remove: (amount) => {
      if (!Number.isFinite(amount)) return
      state.money = clamp0(state.money - amount)
      notify()
    },
    spend: (amount) => {
      if (!valid(amount)) return false
      if (state.money < amount) return false
      state.money -= amount
      notify()
      return true
    },
    canAfford: (amount) => {
      if (!valid(amount)) return false
      return state.money >= amount
    },
    set: (amount) => {
      if (!Number.isFinite(amount)) return
      state.money = clamp0(amount)
      notify()
    },
    reset: () => {
      state.money = 0
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
  useMoneyWeb.setState = (partial: Partial<{ money: number }>) => {
    if ('money' in partial) state.money = partial.money!
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
        money: 0,

        add: (amount: number) => {
          if (!Number.isFinite(amount)) return
          set((s: any) => ({ money: clamp0(s.money + amount) }))
        },

        remove: (amount: number) => {
          if (!Number.isFinite(amount)) return
          set((s: any) => ({ money: clamp0(s.money - amount) }))
        },

        spend: (amount: number) => {
          if (!valid(amount)) return false
          const cur = get().money
          if (cur < amount) return false
          set({ money: cur - amount })
          return true
        },

        canAfford: (amount: number) => {
          if (!valid(amount)) return false
          return get().money >= amount
        },

        set: (amount: number) => {
          if (!Number.isFinite(amount)) return
          set({ money: clamp0(amount) })
        },

        reset: () => set({ money: 0 }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        version: 1,
      },
    ),
  )
}

export { useMoney }
