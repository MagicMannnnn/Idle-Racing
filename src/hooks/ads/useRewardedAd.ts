import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform } from 'react-native'

// Only import on native platforms
let RewardedAd: any
let RewardedAdEventType: any
let AdEventType: any
let TestIds: any

if (Platform.OS !== 'web') {
  const ads = require('react-native-google-mobile-ads')
  RewardedAd = ads.RewardedAd
  RewardedAdEventType = ads.RewardedAdEventType
  AdEventType = ads.AdEventType
  TestIds = ads.TestIds
}

type RewardedAdReward = {
  type: string
  amount: number
}

type UseRewardedAdOpts = {
  adUnitId?: string
  useTestIds?: boolean
}

export function useRewardedAd(opts: UseRewardedAdOpts = {}) {
  const [loaded, setLoaded] = useState(false)
  const [showing, setShowing] = useState(false)

  // holds the reward callback for the current ad show
  const onEarnedRef = useRef<((reward: RewardedAdReward) => void) | null>(null)

  // On web, ads are disabled
  const isWeb = Platform.OS === 'web'

  const adUnitId = useMemo(() => {
    if (isWeb) return ''
    if (opts.useTestIds) return TestIds.REWARDED
    return opts.adUnitId ?? TestIds.REWARDED
  }, [opts.adUnitId, opts.useTestIds, isWeb])

  const rewarded = useMemo(() => {
    if (isWeb) return null
    return RewardedAd.createForAdRequest(adUnitId)
  }, [adUnitId, isWeb])

  useEffect(() => {
    if (isWeb || !rewarded) return

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

    const unsubEarned = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward: RewardedAdReward) => {
        const cb = onEarnedRef.current
        onEarnedRef.current = null
        if (cb) cb(reward)
      },
    )

    rewarded.load()

    return () => {
      unsubLoaded()
      unsubError()
      unsubClosed()
      unsubEarned()
      onEarnedRef.current = null
    }
  }, [rewarded, isWeb])

  const show = useCallback(
    async (onEarned: (reward: RewardedAdReward) => void) => {
      if (isWeb || !rewarded) {
        // On web, simulate immediate reward
        onEarned({ type: 'web-reward', amount: 1 })
        return true
      }

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
    [loaded, showing, rewarded, isWeb],
  )

  return { loaded: isWeb ? true : loaded, showing, show }
}
