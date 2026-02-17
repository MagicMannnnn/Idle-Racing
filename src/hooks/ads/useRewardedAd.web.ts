import { useCallback } from 'react'

type RewardedAdReward = {
  type: string
  amount: number
}

type UseRewardedAdOpts = {
  adUnitId?: string
  useTestIds?: boolean
}

// Web implementation - ads are disabled, simulate immediate rewards
export function useRewardedAd(_opts: UseRewardedAdOpts = {}) {
  const show = useCallback(async (onEarned: (reward: RewardedAdReward) => void) => {
    // On web, simulate immediate reward
    onEarned({ type: 'web-reward', amount: 1 })
    return true
  }, [])

  return {
    loaded: true, // Always loaded on web
    showing: false,
    show,
  }
}
