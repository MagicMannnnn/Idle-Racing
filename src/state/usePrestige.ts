import { useEffect, useReducer } from 'react'
import { Platform } from 'react-native'

import { useEvents } from './useEvents'
import { useMoney } from './useMoney'
import { useTracks } from './useTracks'

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

  //printKnowledgeTable()

  if (totalLevels < 500) return 0

  if (totalLevels <= 1908) {
    // Linear growth for first 1900 levels
    const A = 1.0 / 5.8
    const B = 500
    return Math.floor(A * (totalLevels - B))
  }

  const a = 0.00336
  const b = 0.023
  const c = 1.05
  const d = 8000
  return Math.floor(a * Math.pow(c, b * (totalLevels + d)))
}

// Test function to see knowledge at different level counts
function testKnowledgeFormula(totalLevels: number): number {
  if (totalLevels < 500) return 0
  const a = 0.00336
  const b = 0.023
  const c = 1.05
  const d = 8000
  return Math.floor(a * Math.pow(c, b * (totalLevels + d)))
}

// Call this in console to see the table: usePrestige.getState().testKnowledgeTable()
export function printKnowledgeTable() {
  console.log('Total Levels | Knowledge Points')
  console.log('-------------|------------------')
  for (let levels = 300; levels <= 6000; levels += 300) {
    const knowledge = testKnowledgeFormula(levels)
    console.log(`${levels.toString().padStart(12)} | ${knowledge}`)
  }
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
      // Linear progression: 1x + (totalKnowledge / 100) * 2
      // Each knowledge point adds 0.02x to the multiplier
      return parseFloat((1 + (state.totalKnowledge / 100) * 2).toFixed(2))
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
          // Linear progression: 1x + (totalKnowledge / 100) * 2
          // Each knowledge point adds 0.02x to the multiplier
          return parseFloat((1 + (totalKnowledge / 100) * 2).toFixed(2))
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
