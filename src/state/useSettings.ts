import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type SettingsState = {
  enlargedLeader: boolean
  setEnlargedLeader: (value: boolean) => void
  enableAds: boolean
  setEnableAds: (value: boolean) => void
  reset: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      enlargedLeader: true,
      enableAds: true,
      setEnlargedLeader: (value) => {
        if (typeof value !== 'boolean') return
        set({ enlargedLeader: value })
      },

      setEnableAds: (value) => {
        if (typeof value !== 'boolean') return
        set({ enableAds: value })
      },
      reset: () => set({ enlargedLeader: true, enableAds: true }),
    }),
    {
      name: 'idle.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
