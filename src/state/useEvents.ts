import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useMoney } from '@/src/state/useMoney'
import { useTracks } from '@/src/state/useTracks'

/**
 * SUPER SIMPLE EVENTS STORE
 * - Only one event type: Track Day
 * - While running OR cooling down: track is locked (no upgrades)
 * - While app open: pays out every second
 * - On reopen: estimates offline earnings (capped by runtime)
 *
 * Earnings model (per second):
 * - attendees: ~ rating^2 * 10 each (randomized)
 * - racers:    ~ rating^3 * 50 each (randomized)
 * People counts are derived from capacity + trackSize (maxCapacity).
 */

export type TrackDayEvent = {
  trackId: string
  startedAt: number
  endsAt: number
  lastTickAt: number
  runtimeMs: number
  carry: number // fractional money buffer
  seed: number
  earntLastTick: number
  total: number
}

type EventsState = {
  activeByTrack: Record<string, TrackDayEvent | undefined>
  cooldownUntilByTrack: Record<string, number | undefined>

  isTrackLocked: (trackId: string, now?: number) => boolean
  getActive: (trackId: string) => TrackDayEvent | undefined
  getCooldownRemainingMs: (trackId: string, now?: number) => number

  startTrackDay: (
    trackId: string,
    runtimeMs: number,
  ) => { ok: true } | { ok: false; reason: 'already_running' | 'in_cooldown' | 'track_not_found' }
  stopTrackDay: (trackId: string) => { ok: true } | { ok: false; reason: 'not_running' }

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

function credit(amountFloat: number) {
  if (amountFloat <= 0) return
  const int = Math.floor(amountFloat)
  if (int <= 0) return
  useMoney.getState().add(int)
}

function getTrack(trackId: string) {
  const t = useTracks.getState().tracks.find((x) => x.id === trackId)
  if (!t) return null
  return {
    capacity: t.capacity,
    trackSize: t.maxCapacity, // treat maxCapacity as size for now
    rating: t.rating,
  }
}

function cooldownForRuntime(runtimeMs: number) {
  // simple: 20% of runtime, min 10s, max 1h
  return clamp(Math.round(runtimeMs * 0.2), 10_000, 60 * 60 * 1000)
}

function peopleCounts(capacity: number, trackSize: number, rng: () => number) {
  // attendees roughly tied to capacity
  const attBase = capacity * (0.35 + rng() * 0.55) // 35%..90%
  const attendees = Math.max(0, Math.round(attBase))

  // racers tied to trackSize but bounded by capacity
  const sizeN = clamp(trackSize / 250, 0.3, 2.5)
  const racersBase = capacity * (0.05 + rng() * 0.25) * sizeN // 5%..30% * size factor
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

  const attendeeMean = rating ** 2 * 10
  const racerMean = rating ** 3 * 50

  // randomize around mean (about ±25%)
  const attendeeMult = 0.75 + rng() * 0.5
  const racerMult = 0.75 + rng() * 0.5

  const perSec = (attendees * attendeeMean * attendeeMult + racers * racerMean * racerMult) / 60 // treat the formulas as "per minute" -> pay per second

  return { perSec, nextSeed: nextSeed(seed) }
}

function simulate(event: TrackDayEvent, now: number) {
  const t = getTrack(event.trackId)
  if (!t) return { next: event, creditedInt: 0 }

  const creditEnd = Math.min(now, event.endsAt) // offline capped by endsAt (runtime)
  const seconds = Math.max(0, Math.floor((creditEnd - event.lastTickAt) / 1000))
  if (seconds <= 0) return { next: event, creditedInt: 0 }

  let seed = event.seed
  let carry = event.carry

  for (let i = 0; i < seconds; i++) {
    const r = earningsPerSecond(t.capacity, t.trackSize, t.rating, seed)
    seed = r.nextSeed
    carry += r.perSec
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

export const useEvents = create<EventsState>()(
  persist(
    (set, get) => ({
      activeByTrack: {},
      cooldownUntilByTrack: {},

      isTrackLocked: (trackId, now = Date.now()) => {
        const running = !!get().activeByTrack[trackId]
        const until = get().cooldownUntilByTrack[trackId] ?? 0
        return running || until > now
      },

      getActive: (trackId) => get().activeByTrack[trackId],

      getCooldownRemainingMs: (trackId, now = Date.now()) => {
        const until = get().cooldownUntilByTrack[trackId] ?? 0
        return Math.max(0, until - now)
      },

      startTrackDay: (trackId, runtimeMs) => {
        if (get().activeByTrack[trackId]) return { ok: false as const, reason: 'already_running' }
        if (get().isTrackLocked(trackId)) return { ok: false as const, reason: 'in_cooldown' }

        const t = getTrack(trackId)
        if (!t) return { ok: false as const, reason: 'track_not_found' }

        const now = Date.now()
        const e: TrackDayEvent = {
          trackId,
          startedAt: now,
          endsAt: now + runtimeMs,
          lastTickAt: now,
          runtimeMs,
          carry: 0,
          earntLastTick: 0,
          total: 0,
          seed: (now ^ (trackId.length << 16) ^ 0x9e3779b9) >>> 0,
        }

        set((s) => ({ activeByTrack: { ...s.activeByTrack, [trackId]: e } }))
        get().startTicker()
        return { ok: true as const }
      },

      stopTrackDay: (trackId) => {
        const e = get().activeByTrack[trackId]
        if (!e) return { ok: false as const, reason: 'not_running' }

        const now = Date.now()
        // simulate up to now before stopping
        const res = simulate(e, now)

        const cdMs = cooldownForRuntime(e.runtimeMs)
        set((s) => {
          const nextActive = { ...s.activeByTrack }
          delete nextActive[trackId]
          return {
            activeByTrack: nextActive,
            cooldownUntilByTrack: { ...s.cooldownUntilByTrack, [trackId]: now + cdMs },
          }
        })

        // if we advanced lastTickAt internally, we already credited money inside simulate()
        void res

        return { ok: true as const }
      },

      startTicker: () => {
        // simplest: one global interval stored on globalThis to avoid extra store fields/types
        const g = globalThis as any
        if (g.__eventsTickerId) return

        // reconcile once
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
        const nextCooldown: Record<string, number | undefined> = { ...state.cooldownUntilByTrack }

        for (const trackId of ids) {
          const e = active[trackId]
          if (!e) continue

          // offline capped to runtime via endsAt
          const res = simulate(e, now)
          nextActive[trackId] = res.next
          changed =
            changed ||
            res.next.lastTickAt !== e.lastTickAt ||
            res.next.carry !== e.carry ||
            res.next.seed !== e.seed

          if (now >= e.endsAt) {
            nextCooldown[trackId] = now + cooldownForRuntime(e.runtimeMs)
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
      name: 'idle.events.simple.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
)
