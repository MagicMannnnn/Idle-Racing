import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
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

export const usePrestige = create<PrestigeState>()(
  persist(
    (set, get) => ({
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
        set((s) => ({
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
      name: 'idle.prestige.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
