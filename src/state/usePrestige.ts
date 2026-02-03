import { Platform } from 'react-native'
import { useReducer, useEffect } from 'react'
import { useTracks } from './useTracks'
import { useMoney } from './useMoney'
import { useEvents } from './useEvents'

type PrestigeState = {
  knowledge: number
  totalKnowledge: number

  calculateKnowledge: () => number
  calculateEarningsMultiplier: () => number

  prestige: () => void
  reset: () => void
}

// Calculate knowledge based on total levels of all tracks
function calculateKnowledgeFromTracks(): number {
  const tracks = useTracks.getState().tracks
  let totalLevels = 0

  for (const track of tracks) {
    totalLevels += track.capacityLevel + track.safetyLevel + track.entertainmentLevel
  }

  // Formula: 0 knowledge until 500 levels, then exponential growth
  // Roughly: 600→3, 900→15, 1200→29, 1500→40, 1800→57, 3000→106
  if (totalLevels < 500) return 0
  const excess = totalLevels - 500
  return Math.floor(Math.pow(excess, 1.3) / 40)
}

const STORAGE_KEY = 'idle.prestige.v1'

let usePrestige: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = {
    knowledge: 0,
    totalKnowledge: 0,
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
      console.error('Failed to load prestige state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
    } catch (e) {
      console.error('Failed to save prestige state', e)
    }
  }

  const notify = () => {
    saveToStorage()
    listeners.forEach((fn) => fn())
  }

  loadFromStorage()

  const actions: PrestigeState = {
    knowledge: state.knowledge,
    totalKnowledge: state.totalKnowledge,

    calculateKnowledge: () => {
      return calculateKnowledgeFromTracks()
    },

    calculateEarningsMultiplier: () => {
      // For every 100 knowledge, earnings double
      // 0-99: 1x, 100-199: 2x, 200-299: 4x, etc.
      return Math.floor(Math.pow(2, state.totalKnowledge / 100) * 100) / 100
    },

    prestige: () => {
      const knowledgeGained = calculateKnowledgeFromTracks()

      // Add knowledge to total
      state.knowledge = knowledgeGained
      state.totalKnowledge += knowledgeGained

      // Stop all running events
      useEvents.getState().reset()

      // Reset tracks (not maps)
      useTracks.getState().reset()

      // Reset money to 250
      useMoney.getState().set(250)

      notify()
    },

    reset: () => {
      state.knowledge = 0
      state.totalKnowledge = 0
      notify()
    },
  }

  const usePrestigeWeb: any = (selector?: (state: PrestigeState) => any) => {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])
    const fullState = {
      ...actions,
      knowledge: state.knowledge,
      totalKnowledge: state.totalKnowledge,
    }
    return selector ? selector(fullState) : fullState
  }

  usePrestigeWeb.getState = () => ({
    ...actions,
    knowledge: state.knowledge,
    totalKnowledge: state.totalKnowledge,
  })
  usePrestigeWeb.setState = (partial: Partial<typeof state>) => {
    Object.assign(state, partial)
    notify()
  }

  usePrestige = usePrestigeWeb
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { persist, createJSONStorage } = require('zustand/middleware') as any

  usePrestige = create()(
    persist(
      (set: any, get: any) => ({
        knowledge: 0,
        totalKnowledge: 0,

        calculateKnowledge: () => {
          return calculateKnowledgeFromTracks()
        },

        calculateEarningsMultiplier: () => {
          const totalKnowledge = get().totalKnowledge
          // For every 100 knowledge, earnings double
          // 0-99: 1x, 100-199: 2x, 200-299: 4x, etc.
          return Math.floor(Math.pow(2, totalKnowledge / 100) * 100) / 100
        },

        prestige: () => {
          const knowledgeGained = calculateKnowledgeFromTracks()

          // Add knowledge to total
          set((s: any) => ({
            knowledge: knowledgeGained,
            totalKnowledge: s.totalKnowledge + knowledgeGained,
          }))

          // Stop all running events
          useEvents.getState().reset()

          // Reset tracks (not maps)
          useTracks.getState().reset()

          // Reset money to 250
          useMoney.getState().set(250)
        },

        reset: () => set({ knowledge: 0, totalKnowledge: 0 }),
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        version: 1,
      },
    ),
  )
}

export { usePrestige }
