import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type SettingsState = {
  enlargedLeader: boolean
  setEnlargedLeader: (v: boolean) => void

  enableAds: boolean
  setEnableAds: (v: boolean) => void

  // ✅ new
  speedVariance: number // 0..100
  setSpeedVariance: (v: number) => void
  resetSpeedVariance: () => void

  reset: () => void
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const DEFAULT_SPEED_VARIANCE = 12

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      enlargedLeader: false,
      setEnlargedLeader: (v) => set({ enlargedLeader: !!v }),

      enableAds: true,
      setEnableAds: (v) => set({ enableAds: !!v }),

      speedVariance: DEFAULT_SPEED_VARIANCE,
      setSpeedVariance: (v) => set({ speedVariance: clamp(Math.round(v), 0, 100) }),
      resetSpeedVariance: () => set({ speedVariance: DEFAULT_SPEED_VARIANCE }),

      reset: () =>
        set({
          enlargedLeader: false,
          enableAds: true,
          speedVariance: DEFAULT_SPEED_VARIANCE,
        }),
    }),
    {
      name: 'idle.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
