import type { Person, Profile, Step, Weekday } from '../types'
import { useStore, type Active } from '../store'
import { resolveCore, resolveDay0, resolveSession, type Resolved } from '../engine/program'
import { CORE_KEY, CORE_TITLE } from '../data/core'
import type { Position } from '../engine/calendar'

/** What "today" is for a person. */
export type TodayPlan =
  | { kind: 'before'; days: number }
  | { kind: 'gap' }
  | { kind: 'day0'; res: Resolved }
  | { kind: 'day'; res: Resolved; weekday: Weekday }

export function todayPlan(person: Person, pos: Position, profile: Profile): TodayPlan {
  if (pos.phase === 'before') return { kind: 'before', days: pos.daysToStart }
  if (pos.phase === 'gap') return { kind: 'gap' }
  if (pos.phase === 'day0' || (pos.mergedDay0 && pos.cycle === 1)) return { kind: 'day0', res: resolveDay0(person) }
  return { kind: 'day', weekday: pos.weekday, res: resolveSession(person, pos.weekIndex, pos.weekday, { squatApproved: profile.squatApproved }) }
}

export function resolveActive(person: Person, a: Active, profile: Profile): Resolved & { steps: Step[] } {
  const res = a.key === CORE_KEY ? resolveCore(a.weekIndex) : a.isDay0 ? resolveDay0(person) : resolveSession(person, a.weekIndex, a.weekday as Weekday, { squatApproved: profile.squatApproved })
  return { ...res, steps: res.steps.map((s) => (a.swaps[s.id] ? { ...s, ex: a.swaps[s.id] } : s)) }
}

export function startSession(person: Person, pos: Position, o: { weekday: Weekday; isDay0: boolean; title: string }) {
  const st = useStore.getState()
  const key = o.isDay0 ? 'day0' : o.weekday
  const a: Active = {
    id: `${person}|${pos.date}|${key}`, date: pos.date, key, title: o.title, weekday: o.weekday,
    cycle: pos.cycle, weekIndex: pos.weekIndex, isDay0: o.isDay0, startedAt: Date.now(),
    phase: o.isDay0 ? 'intro' : 'warmup', idx: 0, sets: {}, swaps: {}, rest: null, cardio: {}, checks: {}, prs: [],
  }
  useStore.setState({ active: { ...st.active, [person]: a }, overlay: { type: 'session' } })
}

/** The daily Core & Abs session. Starts straight at the exercises and has its own log id, so the weekly workout is untouched. */
export function startCore(person: Person, pos: Position) {
  const st = useStore.getState()
  const a: Active = {
    id: `${person}|${pos.date}|${CORE_KEY}`, date: pos.date, key: CORE_KEY, title: CORE_TITLE, weekday: 'mon',
    cycle: pos.cycle, weekIndex: Math.max(1, pos.weekIndex), isDay0: false, startedAt: Date.now(),
    phase: 'work', idx: 0, sets: {}, swaps: {}, rest: null, cardio: {}, checks: {}, prs: [],
  }
  useStore.setState({ active: { ...st.active, [person]: a }, overlay: { type: 'session' } })
}
