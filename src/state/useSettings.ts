import { useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

type SettingsState = {
  enlargedLeader: boolean
  setEnlargedLeader: (v: boolean) => void

  enableAds: boolean
  setEnableAds: (v: boolean) => void

  // ✅ new
  speedVariance: number // 0..100
  setSpeedVariance: (v: number) => void
  resetSpeedVariance: () => void

  maxCarCount: number // 5..100
  setMaxCarCount: (v: number) => void
  resetMaxCarCount: () => void

  reset: () => void
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const DEFAULT_SPEED_VARIANCE = 12
const DEFAULT_MAX_CAR_COUNT = 20
const STORAGE_KEY = 'idle.settings.v1'

let useSettings: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = {
    enlargedLeader: false,
    enableAds: true,
    speedVariance: DEFAULT_SPEED_VARIANCE,
    maxCarCount: DEFAULT_MAX_CAR_COUNT,
  }
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        Object.assign(state, parsed.state || parsed)
      }
    } catch (e) {
      console.error('Failed to load settings state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
    } catch (e) {
      console.error('Failed to save settings state', e)
    }
  }

  const notify = () => {
    saveToStorage()
    listeners.forEach((fn) => fn())
  }

  loadFromStorage()

  const actions: SettingsState = {
    enlargedLeader: state.enlargedLeader,
    enableAds: state.enableAds,
    speedVariance: state.speedVariance,
    setEnlargedLeader: (v: boolean) => {
      state.enlargedLeader = !!v
      notify()
    },
    setEnableAds: (v: boolean) => {
      state.enableAds = !!v
      notify()
    },
    setSpeedVariance: (v: number) => {
      state.speedVariance = clamp(Math.round(v), 0, 100)
      notify()
    },
    resetSpeedVariance: () => {
      state.speedVariance = DEFAULT_SPEED_VARIANCE
      notify()
    },
    maxCarCount: state.maxCarCount,
    setMaxCarCount: (v: number) => {
      state.maxCarCount = clamp(Math.round(v), 5, 100)
      notify()
    },
    resetMaxCarCount: () => {
      state.maxCarCount = DEFAULT_MAX_CAR_COUNT
      notify()
    },
    reset: () => {
      state.enlargedLeader = false
      state.enableAds = true
      state.speedVariance = DEFAULT_SPEED_VARIANCE
      state.maxCarCount = DEFAULT_MAX_CAR_COUNT
      notify()
    },
  }

  const useSettingsWeb: any = (selector?: (state: SettingsState) => any) => {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])
    const fullState = {
      ...actions,
      enlargedLeader: state.enlargedLeader,
      enableAds: state.enableAds,
      speedVariance: state.speedVariance,
      maxCarCount: state.maxCarCount,
    }
    return selector ? selector(fullState) : fullState
  }

  useSettingsWeb.getState = () => ({
    ...actions,
    enlargedLeader: state.enlargedLeader,
    enableAds: state.enableAds,
    speedVariance: state.speedVariance,
    maxCarCount: state.maxCarCount,
  })
  useSettingsWeb.setState = (partial: Partial<typeof state>) => {
    Object.assign(state, partial)
    notify()
  }

  useSettings = useSettingsWeb
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { createJSONStorage, persist } = require('zustand/middleware') as any

  useSettings = create()(
    persist(
      (set: any) => ({
        enlargedLeader: false,
        setEnlargedLeader: (v: boolean) => set({ enlargedLeader: !!v }),

        enableAds: true,
        setEnableAds: (v: boolean) => set({ enableAds: !!v }),

        speedVariance: DEFAULT_SPEED_VARIANCE,
        setSpeedVariance: (v: number) => set({ speedVariance: clamp(Math.round(v), 0, 100) }),
        resetSpeedVariance: () => set({ speedVariance: DEFAULT_SPEED_VARIANCE }),

        maxCarCount: DEFAULT_MAX_CAR_COUNT,
        setMaxCarCount: (v: number) => set({ maxCarCount: clamp(Math.round(v), 5, 100) }),
        resetMaxCarCount: () => set({ maxCarCount: DEFAULT_MAX_CAR_COUNT }),

        reset: () =>
          set({
            enlargedLeader: false,
            enableAds: true,
            speedVariance: DEFAULT_SPEED_VARIANCE,
            maxCarCount: DEFAULT_MAX_CAR_COUNT,
          }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        version: 1,
      },
    ),
  )
}

export { useSettings }
