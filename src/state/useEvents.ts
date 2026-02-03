import { Platform } from 'react-native'
import { useReducer, useEffect } from 'react'
import { useMoney } from '@/src/state/useMoney'
import { useTracks } from '@/src/state/useTracks'
import { usePrestige } from '@/src/state/usePrestige'

export type EventType =
  | 'open_track_day'
  | 'closed_testing'
  | 'club_race_day'
  | 'club_race_weekend'
  | 'national_race_day'
  | 'national_race_weekend'
  | 'endurance_race_weekend'

export type CooldownGroup = 'track_day' | 'club' | 'national' | 'endurance'

// Map event types to cooldown groups
function getCooldownGroup(eventType: EventType): CooldownGroup {
  switch (eventType) {
    case 'open_track_day':
    case 'closed_testing':
      return 'track_day'
    case 'club_race_day':
    case 'club_race_weekend':
      return 'club'
    case 'national_race_day':
    case 'national_race_weekend':
      return 'national'
    case 'endurance_race_weekend':
      return 'endurance'
  }
}

// Get available events based on track rating (rounded to 1dp)
export function getAvailableEvents(rating: number): EventType[] {
  const rounded = Math.round(rating * 10) / 10
  const available: EventType[] = ['open_track_day', 'closed_testing']

  if (rounded >= 2.5) available.push('club_race_day')
  if (rounded >= 3.0) available.push('club_race_weekend')
  if (rounded >= 3.5) available.push('national_race_day')
  if (rounded >= 4.0) available.push('national_race_weekend')
  if (rounded >= 4.5) available.push('endurance_race_weekend')

  return available
}

export type TrackDayEvent = {
  trackId: string
  eventType: EventType
  earningsMultiplier: number
  startedAt: number
  endsAt: number
  lastTickAt: number
  runtimeMs: number
  carry: number
  seed: number
  earntLastTick: number
  total: number
  incomeX2: boolean
  // Snapshot of track stats at start
  snapshotCapacity: number
  snapshotTrackSize: number
  snapshotRating: number
}

type EventsState = {
  activeByTrack: Record<string, TrackDayEvent | undefined>
  cooldownUntilByTrack: Record<string, Partial<Record<CooldownGroup, number>> | undefined>

  isTrackLocked: (trackId: string, eventType: EventType, now?: number) => boolean
  getActive: (trackId: string) => TrackDayEvent | undefined
  getCooldownRemainingMs: (trackId: string, eventType: EventType, now?: number) => number

  startTrackDay: (
    trackId: string,
    runtimeMs: number,
    eventType: EventType,
    earningsMultiplier: number,
  ) => { ok: true } | { ok: false; reason: 'already_running' | 'in_cooldown' | 'track_not_found' }
  stopTrackDay: (trackId: string) => { ok: true } | { ok: false; reason: 'not_running' }

  setIncomeBoost: (
    trackId: string,
    enabled: boolean,
  ) => { ok: true } | { ok: false; reason: 'not_running' }

  startTicker: () => void
  stopTicker: () => void
  tickOnce: (now?: number) => void

  reset: () => void
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function nextSeed(seed: number) {
  return (seed * 1664525 + 1013904223) >>> 0
}

function getTrack(trackId: string) {
  const t = useTracks.getState().tracks.find((x: any) => x.id === trackId)
  if (!t) return null
  return {
    capacity: t.capacity,
    trackSize: t.maxCapacity,
    rating: t.rating,
  }
}

function cooldownForEventType(eventType: EventType, runtimeMs: number) {
  switch (eventType) {
    case 'open_track_day':
      // Original logic with minimum 10s cooldown
      if (runtimeMs <= 30_000) return 10_000 // 30 sec -> 10 sec cooldown
      if (runtimeMs <= 60_000) return 15_000 // 1 min -> 15 sec cooldown
      return clamp(Math.round(runtimeMs * 0.05), 10_000, 60 * 60 * 1000)

    case 'closed_testing':
      // Double the open track day cooldown
      if (runtimeMs <= 30_000) return 20_000 // 30 sec -> 20 sec cooldown
      if (runtimeMs <= 60_000) return 30_000 // 1 min -> 30 sec cooldown
      return clamp(Math.round(runtimeMs * 0.1), 20_000, 2 * 60 * 60 * 1000)

    case 'club_race_day':
    case 'club_race_weekend':
      // Cooldown is 1/8th of runtime
      return Math.max(3_000, Math.round(runtimeMs * 0.125))

    case 'national_race_day':
    case 'national_race_weekend':
      return runtimeMs
    case 'endurance_race_weekend':
      // Cooldown equals runtime
      return runtimeMs * 2

    default:
      return clamp(Math.round(runtimeMs * 0.15), 10_000, 60 * 60 * 1000)
  }
}

function peopleCounts(capacity: number, trackSize: number, rng: () => number) {
  const attBase = capacity * (0.45 + rng() * 0.55)
  const attendees = Math.max(0, Math.round(attBase))

  const sizeN = clamp(trackSize / 250, 0.3, 2.5)
  const racersBase = capacity * (0.05 + rng() * 0.25) * sizeN
  const racers = clamp(
    Math.round(racersBase),
    0,
    Math.min(capacity, Math.max(2, Math.floor(capacity / 2))),
  )

  return { attendees, racers }
}

function earningsPerSecond(capacity: number, trackSize: number, rating: number, seed: number) {
  const rng = mulberry32(seed)

  const { attendees, racers } = peopleCounts(capacity, trackSize, rng)

  const attendeeMean = rating ** 3 * 10
  const racerMean = rating ** 2 * 50
  const attendeeMult = 0.75 + rng() * 0.5
  const racerMult = 0.75 + rng() * 0.5

  const perSec = (attendees * attendeeMean * attendeeMult + racers * racerMean * racerMult) / 60

  return { perSec, nextSeed: nextSeed(seed) }
}

function simulate(event: TrackDayEvent, now: number) {
  const creditEnd = Math.min(now, event.endsAt)
  const seconds = Math.max(0, Math.floor((creditEnd - event.lastTickAt) / 1000))
  if (seconds <= 0) return { next: event, creditedInt: 0 }

  let seed = event.seed
  let carry = event.carry

  const mult = event.incomeX2 ? 2 : 1
  const prestigeMult = usePrestige.getState().calculateEarningsMultiplier()
  const eventMult = event.earningsMultiplier || 1

  // Use snapshotted values from when event started
  for (let i = 0; i < seconds; i++) {
    const r = earningsPerSecond(
      event.snapshotCapacity,
      event.snapshotTrackSize,
      event.snapshotRating,
      seed,
    )
    seed = r.nextSeed
    carry += r.perSec * mult * prestigeMult * eventMult
  }

  const creditable = Math.floor(carry)
  event.earntLastTick = creditable
  event.total += creditable
  if (creditable > 0) {
    useMoney.getState().add(creditable)
    carry -= creditable
  }

  const next: TrackDayEvent = {
    ...event,
    lastTickAt: event.lastTickAt + seconds * 1000,
    carry,
    seed,
  }

  return { next, creditedInt: creditable }
}

const STORAGE_KEY = 'idle.events.simple.v1'

let useEvents: any

// Web implementation using localStorage
if (Platform.OS === 'web') {
  let state = {
    activeByTrack: {} as Record<string, TrackDayEvent | undefined>,
    cooldownUntilByTrack: {} as Record<string, Partial<Record<CooldownGroup, number>> | undefined>,
  }
  const listeners = new Set<() => void>()

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        const data = parsed.state || parsed
        // Migrate old data
        const abt = (data.activeByTrack ?? {}) as Record<string, any>
        const next: Record<string, any> = {}
        for (const k of Object.keys(abt)) {
          const e = abt[k]
          if (!e) continue
          next[k] = { ...e, incomeX2: !!e.incomeX2 }
        }
        state.activeByTrack = next
        state.cooldownUntilByTrack = data.cooldownUntilByTrack || {}
      }
    } catch (e) {
      console.error('Failed to load events state', e)
    }
  }

  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version: 1 }))
    } catch (e) {
      console.error('Failed to save events state', e)
    }
  }

  const notify = () => {
    saveToStorage()
    listeners.forEach((fn) => fn())
  }

  loadFromStorage()

  const actions: EventsState = {
    activeByTrack: state.activeByTrack,
    cooldownUntilByTrack: state.cooldownUntilByTrack,

    isTrackLocked: (trackId: string, eventType: EventType, now = Date.now()) => {
      const running = !!state.activeByTrack[trackId]
      const cooldownGroup = getCooldownGroup(eventType)
      const groupCooldowns = state.cooldownUntilByTrack[trackId]
      if (!groupCooldowns) return running
      const until = groupCooldowns[cooldownGroup] ?? 0
      return running || until > now
    },

    getActive: (trackId: string) => state.activeByTrack[trackId],

    getCooldownRemainingMs: (trackId: string, eventType: EventType, now = Date.now()) => {
      const cooldownGroup = getCooldownGroup(eventType)
      const groupCooldowns = state.cooldownUntilByTrack[trackId]
      if (!groupCooldowns) return 0
      const until = groupCooldowns[cooldownGroup] ?? 0
      return Math.max(0, until - now)
    },

    startTrackDay: (
      trackId: string,
      runtimeMs: number,
      eventType: EventType,
      earningsMultiplier: number,
    ) => {
      if (state.activeByTrack[trackId])
        return { ok: false as const, reason: 'already_running' as const }
      if (actions.isTrackLocked(trackId, eventType))
        return { ok: false as const, reason: 'in_cooldown' as const }

      const t = getTrack(trackId)
      if (!t) return { ok: false as const, reason: 'track_not_found' as const }

      const now = Date.now()
      const e: TrackDayEvent = {
        trackId,
        eventType,
        earningsMultiplier,
        startedAt: now,
        endsAt: now + runtimeMs,
        lastTickAt: now,
        runtimeMs,
        carry: 0,
        earntLastTick: 0,
        total: 0,
        incomeX2: false,
        seed: (now ^ (trackId.length << 16) ^ 0x9e3779b9) >>> 0,
        // Snapshot current track stats
        snapshotCapacity: t.capacity,
        snapshotTrackSize: t.trackSize,
        snapshotRating: t.rating,
      }

      state.activeByTrack = { ...state.activeByTrack, [trackId]: e }
      actions.startTicker()
      notify()
      return { ok: true as const }
    },

    stopTrackDay: (trackId: string) => {
      const e = state.activeByTrack[trackId]
      if (!e) return { ok: false as const, reason: 'not_running' as const }

      const now = Date.now()
      const res = simulate(e, now)

      const cdMs = cooldownForEventType(e.eventType, e.runtimeMs)
      const cooldownGroup = getCooldownGroup(e.eventType)
      const nextActive = { ...state.activeByTrack }
      delete nextActive[trackId]
      state.activeByTrack = nextActive

      const trackCooldowns = state.cooldownUntilByTrack[trackId] || {}
      state.cooldownUntilByTrack = {
        ...state.cooldownUntilByTrack,
        [trackId]: { ...trackCooldowns, [cooldownGroup]: now + cdMs },
      }

      notify()
      void res
      return { ok: true as const }
    },

    setIncomeBoost: (trackId: string, enabled: boolean) => {
      const e = state.activeByTrack[trackId]
      if (!e) return { ok: false as const, reason: 'not_running' as const }
      const on = !!enabled
      if (e.incomeX2 === on) return { ok: true as const }

      state.activeByTrack = {
        ...state.activeByTrack,
        [trackId]: { ...(state.activeByTrack[trackId] as TrackDayEvent), incomeX2: on },
      }
      notify()

      return { ok: true as const }
    },

    startTicker: () => {
      const g = globalThis as any
      if (g.__eventsTickerId) return
      actions.tickOnce(Date.now())

      g.__eventsTickerId = setInterval(() => {
        actions.tickOnce(Date.now())
      }, 1000)
    },

    stopTicker: () => {
      const g = globalThis as any
      const id = g.__eventsTickerId
      if (id) clearInterval(id)
      g.__eventsTickerId = null
    },

    tickOnce: (now = Date.now()) => {
      const active = state.activeByTrack
      const ids = Object.keys(active)
      if (ids.length === 0) {
        actions.stopTicker()
        return
      }

      let changed = false
      const nextActive: Record<string, TrackDayEvent | undefined> = { ...active }
      const nextCooldown: Record<string, Partial<Record<CooldownGroup, number>> | undefined> = {
        ...state.cooldownUntilByTrack,
      }

      for (const trackId of ids) {
        const e = active[trackId]
        if (!e) continue
        const res = simulate(e, now)
        nextActive[trackId] = res.next
        changed =
          changed ||
          res.next.lastTickAt !== e.lastTickAt ||
          res.next.carry !== e.carry ||
          res.next.seed !== e.seed ||
          res.next.earntLastTick !== e.earntLastTick ||
          res.next.total !== e.total ||
          res.next.incomeX2 !== e.incomeX2

        if (now >= e.endsAt) {
          const cooldownGroup = getCooldownGroup(e.eventType)
          const trackCooldowns = nextCooldown[trackId] || {}
          nextCooldown[trackId] = {
            ...trackCooldowns,
            [cooldownGroup]: now + cooldownForEventType(e.eventType, e.runtimeMs),
          }
          delete nextActive[trackId]
          changed = true
        }
      }

      if (changed) {
        state.activeByTrack = nextActive
        state.cooldownUntilByTrack = nextCooldown
        notify()
      }
    },

    reset: () => {
      actions.stopTicker()
      state.activeByTrack = {}
      state.cooldownUntilByTrack = {}
      notify()
    },
  }

  const useEventsWeb: any = (selector?: (state: EventsState) => any) => {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
    useEffect(() => {
      listeners.add(forceUpdate)
      return () => {
        listeners.delete(forceUpdate)
      }
    }, [])
    const fullState = {
      ...actions,
      activeByTrack: state.activeByTrack,
      cooldownUntilByTrack: state.cooldownUntilByTrack,
    }
    return selector ? selector(fullState) : fullState
  }

  useEventsWeb.getState = () => ({
    ...actions,
    activeByTrack: state.activeByTrack,
    cooldownUntilByTrack: state.cooldownUntilByTrack,
  })
  useEventsWeb.setState = (partial: Partial<typeof state>) => {
    Object.assign(state, partial)
    notify()
  }

  useEvents = useEventsWeb
} else {
  // Native implementation using zustand
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  const { create } = require('zustand') as any
  const { createJSONStorage, persist } = require('zustand/middleware') as any

  useEvents = create()(
    persist(
      (set: any, get: any) => ({
        activeByTrack: {},
        cooldownUntilByTrack: {},

        isTrackLocked: (trackId: string, eventType: EventType, now = Date.now()) => {
          const running = !!get().activeByTrack[trackId]
          const cooldownGroup = getCooldownGroup(eventType)
          const groupCooldowns = get().cooldownUntilByTrack[trackId]
          if (!groupCooldowns) return running
          const until = groupCooldowns[cooldownGroup] ?? 0
          return running || until > now
        },

        getActive: (trackId: string) => get().activeByTrack[trackId],

        getCooldownRemainingMs: (trackId: string, eventType: EventType, now = Date.now()) => {
          const cooldownGroup = getCooldownGroup(eventType)
          const groupCooldowns = get().cooldownUntilByTrack[trackId]
          if (!groupCooldowns) return 0
          const until = groupCooldowns[cooldownGroup] ?? 0
          return Math.max(0, until - now)
        },

        startTrackDay: (
          trackId: string,
          runtimeMs: number,
          eventType: EventType,
          earningsMultiplier: number,
        ) => {
          if (get().activeByTrack[trackId]) return { ok: false as const, reason: 'already_running' }
          if (get().isTrackLocked(trackId, eventType))
            return { ok: false as const, reason: 'in_cooldown' }

          const t = getTrack(trackId)
          if (!t) return { ok: false as const, reason: 'track_not_found' }

          const now = Date.now()
          const e: TrackDayEvent = {
            trackId,
            eventType,
            earningsMultiplier,
            startedAt: now,
            endsAt: now + runtimeMs,
            lastTickAt: now,
            runtimeMs,
            carry: 0,
            earntLastTick: 0,
            total: 0,
            incomeX2: false,
            seed: (now ^ (trackId.length << 16) ^ 0x9e3779b9) >>> 0,
            // Snapshot current track stats
            snapshotCapacity: t.capacity,
            snapshotTrackSize: t.trackSize,
            snapshotRating: t.rating,
          }

          set((s: any) => ({ activeByTrack: { ...s.activeByTrack, [trackId]: e } }))
          get().startTicker()
          return { ok: true as const }
        },

        stopTrackDay: (trackId: string) => {
          const e = get().activeByTrack[trackId]
          if (!e) return { ok: false as const, reason: 'not_running' }

          const now = Date.now()
          const res = simulate(e, now)

          const cdMs = cooldownForEventType(e.eventType, e.runtimeMs)
          const cooldownGroup = getCooldownGroup(e.eventType)
          set((s: any) => {
            const nextActive = { ...s.activeByTrack }
            delete nextActive[trackId]
            const trackCooldowns = s.cooldownUntilByTrack[trackId] || {}
            return {
              activeByTrack: nextActive,
              cooldownUntilByTrack: {
                ...s.cooldownUntilByTrack,
                [trackId]: { ...trackCooldowns, [cooldownGroup]: now + cdMs },
              },
            }
          })

          void res
          return { ok: true as const }
        },

        setIncomeBoost: (trackId: string, enabled: boolean) => {
          const e = get().activeByTrack[trackId]
          if (!e) return { ok: false as const, reason: 'not_running' }
          const on = !!enabled
          if (e.incomeX2 === on) return { ok: true as const }

          set((s: any) => ({
            activeByTrack: {
              ...s.activeByTrack,
              [trackId]: { ...(s.activeByTrack[trackId] as TrackDayEvent), incomeX2: on },
            },
          }))

          return { ok: true as const }
        },

        startTicker: () => {
          const g = globalThis as any
          if (g.__eventsTickerId) return
          get().tickOnce(Date.now())

          g.__eventsTickerId = setInterval(() => {
            get().tickOnce(Date.now())
          }, 1000)
        },

        stopTicker: () => {
          const g = globalThis as any
          const id = g.__eventsTickerId
          if (id) clearInterval(id)
          g.__eventsTickerId = null
        },

        tickOnce: (now = Date.now()) => {
          const state = get()
          const active = state.activeByTrack
          const ids = Object.keys(active)
          if (ids.length === 0) {
            get().stopTicker()
            return
          }

          let changed = false
          const nextActive: Record<string, TrackDayEvent | undefined> = { ...active }
          const nextCooldown: Record<string, Partial<Record<CooldownGroup, number>> | undefined> = {
            ...state.cooldownUntilByTrack,
          }

          for (const trackId of ids) {
            const e = active[trackId]
            if (!e) continue
            const res = simulate(e, now)
            nextActive[trackId] = res.next
            changed =
              changed ||
              res.next.lastTickAt !== e.lastTickAt ||
              res.next.carry !== e.carry ||
              res.next.seed !== e.seed ||
              res.next.earntLastTick !== e.earntLastTick ||
              res.next.total !== e.total ||
              res.next.incomeX2 !== e.incomeX2

            if (now >= e.endsAt) {
              const cooldownGroup = getCooldownGroup(e.eventType)
              const trackCooldowns = nextCooldown[trackId] || {}
              nextCooldown[trackId] = {
                ...trackCooldowns,
                [cooldownGroup]: now + cooldownForEventType(e.eventType, e.runtimeMs),
              }
              delete nextActive[trackId]
              changed = true
            }
          }

          if (changed) set({ activeByTrack: nextActive, cooldownUntilByTrack: nextCooldown })
        },

        reset: () => {
          get().stopTicker()
          set({ activeByTrack: {}, cooldownUntilByTrack: {} })
        },
      }),
      {
        name: STORAGE_KEY,
        storage: createJSONStorage(() => AsyncStorage),
        version: 1,
        migrate: (persisted: any, version: number) => {
          const p = (persisted ?? {}) as any
          if (version < 1) return p

          // Add incomeX2 default for older persisted events
          const abt = (p.activeByTrack ?? {}) as Record<string, any>
          const next: Record<string, any> = {}
          for (const k of Object.keys(abt)) {
            const e = abt[k]
            if (!e) continue
            next[k] = { ...e, incomeX2: !!e.incomeX2 }
          }

          return { ...p, activeByTrack: next }
        },
      },
    ),
  )
}

export { useEvents }
