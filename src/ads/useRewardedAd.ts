import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
  type RewardedAdReward,
} from 'react-native-google-mobile-ads'

type UseRewardedAdOpts = {
  adUnitId?: string
  useTestIds?: boolean
}

export function useRewardedAd(opts: UseRewardedAdOpts = {}) {
  const [loaded, setLoaded] = useState(false)
  const [showing, setShowing] = useState(false)

  // holds the reward callback for the current ad show
  const onEarnedRef = useRef<((reward: RewardedAdReward) => void) | null>(null)

  const adUnitId = useMemo(() => {
    if (opts.useTestIds) return TestIds.REWARDED
    return opts.adUnitId ?? TestIds.REWARDED
  }, [opts.adUnitId, opts.useTestIds])

  const rewarded = useMemo(() => RewardedAd.createForAdRequest(adUnitId), [adUnitId])

  useEffect(() => {
    setLoaded(false)
    setShowing(false)
    onEarnedRef.current = null

    const unsubLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setLoaded(true)
    })

    const unsubError = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      setLoaded(false)
      setShowing(false)
      onEarnedRef.current = null
    })

    const unsubClosed = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      setShowing(false)
      setLoaded(false)
      rewarded.load()
    })

    const unsubEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      const cb = onEarnedRef.current
      onEarnedRef.current = null
      if (cb) cb(reward)
    })

    rewarded.load()

    return () => {
      unsubLoaded()
      unsubError()
      unsubClosed()
      unsubEarned()
      onEarnedRef.current = null
    }
  }, [rewarded])

  const show = useCallback(
    async (onEarned: (reward: RewardedAdReward) => void) => {
      if (!loaded || showing) return false

      onEarnedRef.current = onEarned
      setShowing(true)

      try {
        await rewarded.show()
        return true
      } catch {
        setShowing(false)
        onEarnedRef.current = null
        return false
      }
    },
    [loaded, showing, rewarded],
  )

  return { loaded, showing, show }
}
