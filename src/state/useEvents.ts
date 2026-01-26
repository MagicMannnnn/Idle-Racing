// src/state/useEvents.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useMoney } from '@/src/state/useMoney'
import { useTracks } from '@/src/state/useTracks'

/**
 * Only ONE event implemented for now: Track Day
 * - One active event per track
 * - While running: track is "locked" (your upgrade store can call useEvents.getState().isTrackLocked(trackId))
 * - While app is open: money is granted gradually via a 1s ticker
 * - On reopen: earnings are estimated for time away (capped)
 */

export type EventType = 'track_day'

export type TrackDayConfig = {
  /** Total runtime of the event (ms). e.g. 10 min */
  runtimeMs: number

  /**
   * Max time we will credit offline for this event.
   * If user is away longer than this, we stop crediting at (startedAt + maxOfflineCreditMs).
   * Usually set to runtimeMs.
   */
  maxOfflineCreditMs: number

  /** Ticket price per attendee per minute (money/min). */
  ticketPricePerMinute: (p: AttendanceParams) => number

  /**
   * Attendance "target" as a fraction of capacity (0..1), derived from track stats.
   * This is the center-point the crowd fluctuates around.
   */
  targetFillRatio: (p: AttendanceParams) => number

  /**
   * Max change in attendees per second, before clamping.
   * Lets you tune how fast the crowd fills/drains.
   */
  maxDeltaPerSecond: (p: AttendanceParams) => number

  /**
   * Randomness strength (0..1-ish). Higher = more volatile occupancy.
   */
  volatility: (p: AttendanceParams) => number
}

export type AttendanceParams = {
  // track stats snapshot (pulled from tracks store at tick-time)
  capacity: number // current capacity
  maxCapacity: number // size proxy (track "size")
  safety: number // 0..maxSafety
  maxSafety: number
  entertainment: number // 0..maxEntertainment (%)
  maxEntertainment: number
  index: number // track index (0-based)
  rating: number // computed rating from store
}

export type TrackEventState = {
  trackId: string
  type: EventType

  startedAt: number
  endsAt: number

  /** last time we simulated a tick (ms) */
  lastTickAt: number

  /** occupancy is dynamic (attendees currently inside) */
  occupancy: number

  /** money earned so far during this event */
  earned: number

  /** for deterministic-ish randomness */
  rng: number
}

type EventsState = {
  // Map of trackId -> active event (only one per track)
  activeByTrack: Record<string, TrackEventState | undefined>

  // Internal ticker control
  tickerRunning: boolean
  _intervalId?: number

  // ---- API ----
  isTrackLocked: (trackId: string) => boolean
  getActive: (trackId: string) => TrackEventState | undefined

  startTrackDay: (
    trackId: string,
    runtimeMs: number,
  ) => { ok: true } | { ok: false; reason: 'already_running' | 'track_not_found' }
  stopEvent: (trackId: string) => { ok: true } | { ok: false; reason: 'not_running' }

  /** Start/stop the 1s simulation loop (call from RootLayout/AppState) */
  startTicker: () => void
  stopTicker: () => void

  /** Manually run one tick (mostly for tests) */
  tickOnce: (now?: number) => void

  reset: () => void
}

/**
 * ----- Track Day tuning (easy to tweak) -----
 */
export const trackDayConfig: TrackDayConfig = {
  runtimeMs: 10 * 60 * 1000,
  maxOfflineCreditMs: 10 * 60 * 1000,

  ticketPricePerMinute: (p) => {
    // baseline, slightly boosted by entertainment and track index
    const entN = p.maxEntertainment ? p.entertainment / p.maxEntertainment : 0
    return 0.8 + entN * 1.2 + p.index * 0.05
  },

  targetFillRatio: (p) => {
    // capacity fill driven mostly by entertainment & safety (safe + fun attracts)
    const entN = p.maxEntertainment ? p.entertainment / p.maxEntertainment : 0
    const safN = p.maxSafety ? p.safety / p.maxSafety : 0
    // keep it sane (never 100% constant)
    return clamp(0.25 + entN * 0.45 + safN * 0.2, 0.15, 0.92)
  },

  maxDeltaPerSecond: (p) => {
    // bigger tracks change faster; small tracks fill slowly
    const sizeN = p.maxCapacity ? clamp(p.maxCapacity / 250, 0.2, 2.0) : 1
    return 1.5 * sizeN // attendees/sec (before randomness)
  },

  volatility: (p) => {
    // race-day would be higher; track day is pretty stable
    const entN = p.maxEntertainment ? p.entertainment / p.maxEntertainment : 0
    return 0.15 + entN * 0.1
  },
}

// -------- helpers --------
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
  // simple LCG-ish
  return (seed * 1664525 + 1013904223) >>> 0
}

function getTrackParams(trackId: string): AttendanceParams | null {
  const t = useTracks.getState().tracks.find((x) => x.id === trackId)
  if (!t) return null
  return {
    capacity: t.capacity,
    maxCapacity: t.maxCapacity,
    safety: t.safety,
    maxSafety: t.maxSafety,
    entertainment: t.entertainment,
    maxEntertainment: t.maxEntertainment,
    index: t.index ?? 0, // if you don’t have index in store, add it OR derive from id
    rating: t.rating,
  }
}

/**
 * One second of simulation:
 * - crowd moves towards a target occupancy based on track stats
 * - with some randomness, people enter/exit
 * - revenue credited proportional to occupancy (and stats)
 */
function simulateOneSecondTrackDay(
  e: TrackEventState,
  p: AttendanceParams,
  cfg: TrackDayConfig,
): { next: TrackEventState; moneyDelta: number } {
  const rngFn = mulberry32(e.rng)
  const rand = rngFn() - 0.5 // -0.5..0.5
  const rand2 = rngFn() - 0.5

  const targetRatio = cfg.targetFillRatio(p)
  const targetOcc = Math.round(targetRatio * p.capacity)

  const maxDelta = cfg.maxDeltaPerSecond(p)
  const vol = cfg.volatility(p)

  // drift towards target + randomness (enter/exit)
  const drift = clamp((targetOcc - e.occupancy) * 0.08, -maxDelta, maxDelta)
  const noise = rand * maxDelta * vol * 2 + rand2 * 0.4

  const delta = Math.round(clamp(drift + noise, -maxDelta, maxDelta))
  const nextOcc = clamp(e.occupancy + delta, 0, p.capacity)

  // Revenue per second:
  // ticketPrice/min * occupancy / 60
  const perMin = cfg.ticketPricePerMinute(p)
  const moneyDelta = (perMin * nextOcc) / 60

  const next: TrackEventState = {
    ...e,
    occupancy: nextOcc,
    earned: e.earned + moneyDelta,
    rng: nextSeed(e.rng),
  }

  return { next, moneyDelta }
}

export const useEvents = create<EventsState>()(
  persist(
    (set, get) => ({
      activeByTrack: {},
      tickerRunning: false,
      _intervalId: undefined,

      isTrackLocked: (trackId) => !!get().activeByTrack[trackId],
      getActive: (trackId) => get().activeByTrack[trackId],

      startTrackDay: (trackId, runtimeMs) => {
        const existing = get().activeByTrack[trackId]
        if (existing) return { ok: false as const, reason: 'already_running' }

        const p = getTrackParams(trackId)
        if (!p) return { ok: false as const, reason: 'track_not_found' }

        const now = Date.now()
        const endsAt = now + runtimeMs

        // start with a small crowd so it feels alive
        const startOcc = clamp(Math.round(p.capacity * 0.2), 0, p.capacity)

        const event: TrackEventState = {
          trackId,
          type: 'track_day',
          startedAt: now,
          endsAt,
          lastTickAt: now,
          occupancy: startOcc,
          earned: 0,
          rng: (now ^ trackId.length ^ 0x9e3779b9) >>> 0,
        }

        set((s) => ({
          activeByTrack: { ...s.activeByTrack, [trackId]: event },
        }))

        // Ensure ticker is running if they start an event
        get().startTicker()

        return { ok: true as const }
      },

      stopEvent: (trackId) => {
        const existing = get().activeByTrack[trackId]
        if (!existing) return { ok: false as const, reason: 'not_running' }

        set((s) => {
          const next = { ...s.activeByTrack }
          delete next[trackId]
          return { activeByTrack: next }
        })

        return { ok: true as const }
      },

      startTicker: () => {
        if (get().tickerRunning) return

        // Reconcile offline time once at ticker start (rehydrate-safe)
        get().tickOnce(Date.now())

        const id = setInterval(() => {
          get().tickOnce(Date.now())
        }, 1000) as unknown as number

        set({ tickerRunning: true, _intervalId: id })
      },

      stopTicker: () => {
        const id = get()._intervalId
        if (id != null) clearInterval(id as any)
        set({ tickerRunning: false, _intervalId: undefined })
      },

      tickOnce: (now = Date.now()) => {
        const state = get()
        const active = state.activeByTrack
        const trackIds = Object.keys(active)
        if (trackIds.length === 0) return

        let changed = false
        const nextByTrack: Record<string, TrackEventState | undefined> = { ...active }

        for (const trackId of trackIds) {
          const e = active[trackId]
          if (!e) continue

          // Determine effective end for crediting (cap offline)
          const cfg = trackDayConfig
          const maxCreditEnd = e.startedAt + Math.min(cfg.maxOfflineCreditMs, cfg.runtimeMs)
          const creditEnd = Math.min(e.endsAt, maxCreditEnd)

          // If event is past credit end, finalize and remove
          if (now >= creditEnd) {
            // Run remaining time up to creditEnd (if lastTickAt behind)
            const finalTickAt = Math.min(creditEnd, now)
            const res = simulateRange(e, trackId, finalTickAt)
            if (res.moneyDelta > 0) creditMoney(res.moneyDelta)

            delete nextByTrack[trackId]
            changed = true
            continue
          }

          // Otherwise, simulate forward from lastTickAt to now (cap to creditEnd)
          const targetNow = Math.min(now, creditEnd)
          if (targetNow <= e.lastTickAt) continue

          const res = simulateRange(e, trackId, targetNow)
          if (res.moneyDelta > 0) creditMoney(res.moneyDelta)

          nextByTrack[trackId] = {
            ...res.next,
            lastTickAt: targetNow,
          }
          changed = true
        }

        if (changed) set({ activeByTrack: nextByTrack })
      },

      reset: () => {
        const id = get()._intervalId
        if (id != null) clearInterval(id as any)
        set({ activeByTrack: {}, tickerRunning: false, _intervalId: undefined })
      },
    }),
    {
      name: 'idle.events.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Note: On rehydrate, the ticker isn't automatically started (so we don't leak intervals).
      // Call useEvents.getState().startTicker() from your RootLayout/AppState once app is active.
    },
  ),
)

/**
 * Simulate in 1-second steps up to targetTime.
 * - While app is open, tickOnce() is called every 1s, so this does 1 step.
 * - On reopen/offline gap, it may do many steps; we cap cost by chunking:
 *   - If gap > 60s, step in 5s increments to keep it cheap (still plausible).
 */
function simulateRange(event: TrackEventState, trackId: string, targetTime: number) {
  const p = getTrackParams(trackId)
  if (!p) return { next: event, moneyDelta: 0 }

  const cfg = trackDayConfig

  const dtMs = targetTime - event.lastTickAt
  const seconds = Math.max(0, Math.floor(dtMs / 1000))
  if (seconds <= 0) return { next: event, moneyDelta: 0 }

  // Step size: 1s when small gaps, 5s when larger gaps (offline)
  const stepSec = seconds <= 60 ? 1 : 5
  const steps = Math.ceil(seconds / stepSec)

  let cur = event
  let totalMoney = 0

  for (let i = 0; i < steps; i++) {
    // When stepping 5s, run 5 x 1-second sims (still consistent behaviour)
    const inner = stepSec
    for (let s = 0; s < inner; s++) {
      // stop if we overshoot targetTime (due to ceil)
      const simulatedMs = (i * stepSec + s + 1) * 1000
      if (simulatedMs > dtMs) break

      const out = simulateOneSecondTrackDay(cur, p, cfg)
      cur = out.next
      totalMoney += out.moneyDelta
    }
  }

  return { next: cur, moneyDelta: totalMoney }
}

/**
 * Credits money gradually to the Money store.
 * Adjust this method call to your actual useMoney API.
 */
function creditMoney(amount: number) {
  const rounded = Math.max(0, Math.round(amount))
  if (rounded <= 0) return

  const money = useMoney.getState() as any
  if (typeof money.add === 'function') {
    money.add(rounded)
    return
  }
  if (typeof money.earn === 'function') {
    money.earn(rounded)
    return
  }
  // If your store uses a setter instead, update this accordingly.
}
