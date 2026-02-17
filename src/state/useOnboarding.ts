import { useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

type OnboardingState = {
  hasHydrated?: boolean
  completed: boolean
  stage: number
  setStage: (stage: number) => void
  complete: () => void
  reset: () => void
}

const STORAGE_KEY = 'idle.onboarding.v1'

let useOnboarding: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = { hasHydrated: true, completed: false, stage: 0 }
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        Object.assign(state, parsed.state || parsed)
        state.hasHydrated = true
      }
    } catch (e) {
      console.error('Failed to load onboarding state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
    } catch (e) {
      console.error('Failed to save onboarding state', e)
    }
  }

  const notify = () => {
    saveToStorage()
    listeners.forEach((fn) => fn())
  }

  loadFromStorage()

  const actions: OnboardingState = {
    hasHydrated: state.hasHydrated,
    completed: state.completed,
    stage: state.stage,
    setStage: (stage: number) => {
      state.stage = stage
      notify()
    },
    complete: () => {
      state.completed = true
      state.stage = 0
      notify()
    },
    reset: () => {
      state.completed = false
      state.stage = 0
      notify()
    },
  }

  const useOnboardingWeb: any = (selector?: (state: OnboardingState) => any) => {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])
    const fullState = {
      ...actions,
      hasHydrated: state.hasHydrated,
      completed: state.completed,
      stage: state.stage,
    }
    return selector ? selector(fullState) : fullState
  }

  useOnboardingWeb.getState = () => ({
    ...actions,
    hasHydrated: state.hasHydrated,
    completed: state.completed,
    stage: state.stage,
  })
  useOnboardingWeb.setState = (partial: Partial<OnboardingState>) => {
    Object.assign(state, partial)
    notify()
  }

  useOnboarding = useOnboardingWeb
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { persist, createJSONStorage } = require('zustand/middleware') as any

  useOnboarding = create()(
    persist(
      (set: any) => ({
        hasHydrated: false,
        completed: false,
        stage: 0,

        setStage: (stage: number) => set({ stage }),
        complete: () => set({ completed: true, stage: 0 }),
        reset: () => set({ completed: false, stage: 0 }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        onRehydrateStorage: () => () => {
          useOnboarding.setState({ hasHydrated: true })
        },
        version: 1,
      },
    ),
  )
}

export { useOnboarding }
