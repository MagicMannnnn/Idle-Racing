import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

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

export const useMoney = create<MoneyState>()(
  persist(
    (set, get) => ({
      money: 0,

      add: (amount) => {
        if (!Number.isFinite(amount)) return
        set((s) => ({ money: clamp0(s.money + amount) }))
      },

      remove: (amount) => {
        if (!Number.isFinite(amount)) return
        set((s) => ({ money: clamp0(s.money - amount) }))
      },

      spend: (amount) => {
        if (!valid(amount)) return false
        const cur = get().money
        if (cur < amount) return false
        set({ money: cur - amount })
        return true
      },

      canAfford: (amount) => {
        if (!valid(amount)) return false
        return get().money >= amount
      },

      set: (amount) => {
        if (!Number.isFinite(amount)) return
        set({ money: clamp0(amount) })
      },

      reset: () => set({ money: 0 }),
    }),
    {
      name: 'idle.money.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
