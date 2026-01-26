import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type OnboardingState = {
  completed: boolean
  stage: number
  setStage: (stage: number) => void
  complete: () => void
  reset: () => void
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      completed: false,
      stage: 0,

      setStage: (stage) => set({ stage }),
      complete: () => set({ completed: true, stage: 0 }),
      reset: () => set({ completed: false, stage: 0 }),
    }),
    {
      name: 'idle.onboarding.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
