import type { Person, SessionLog } from '../types'
import type { Past } from '../engine/progression'
import { addDays, weekdayOf } from '../engine/calendar'

/** Per-exercise history, most recent first. A session's load is the heaviest completed set. */
export function pastByExercise(sessions: SessionLog[]): Record<string, Past[]> {
  const out: Record<string, Past[]> = {}
  const sorted = [...sessions].filter((s) => s.finishedAt).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)
  for (const s of sorted) {
    const byEx: Record<string, Past> = {}
    for (const [step, sets] of Object.entries(s.sets)) {
      const ex = s.exOf[step]
      const done = sets.filter((x) => x.done)
      if (!ex || !done.length) continue
      const p = (byEx[ex] ??= { w: 0, reps: [] })
      p.w = Math.max(p.w, ...done.map((x) => x.w))
      p.reps.push(...done.map((x) => x.r))
    }
    for (const [ex, p] of Object.entries(byEx)) (out[ex] ??= []).push(p)
  }
  return out
}
export function allSets(sessions: SessionLog[], ex: string): { w: number; r: number; date: string }[] {
  const out: { w: number; r: number; date: string }[] = []
  for (const s of sessions) for (const [step, sets] of Object.entries(s.sets)) if (s.exOf[step] === ex) sets.filter((x) => x.done).forEach((x) => out.push({ w: x.w, r: x.r, date: s.date }))
  return out
}

const GYM_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri'])
/** Sessions in a row without missing a Mon–Fri gym day (today doesn't break it until it's over). */
export function streak(sessions: SessionLog[], today: string, firstDay: string, skipped?: ReadonlySet<string>, isGymDay?: (date: string) => boolean): number {
  const dates = new Set(sessions.filter((s) => s.finishedAt).map((s) => s.date))
  let n = 0
  for (let d = today, i = 0; i < 400 && d >= firstDay; d = addDays(d, -1), i++) {
    if (dates.has(d)) n++
    else if (skipped?.has(d)) continue          // marked "not going": neither counts nor breaks
    else if ((isGymDay ? isGymDay(d) : GYM_DAYS.has(weekdayOf(d))) && d !== today) break
  }
  return n
}
export const weekKeys = (sessions: SessionLog[], cycle: number, weekIndex: number) =>
  new Set(sessions.filter((s) => s.finishedAt && s.cycle === cycle && s.weekIndex === weekIndex).map((s) => s.key))

export function volumeOf(s: Pick<SessionLog, 'sets'>): number {
  let v = 0
  Object.values(s.sets).forEach((sets) => sets.forEach((x) => { if (x.done) v += x.w * x.r }))
  return Math.round(v)
}
export const otherPerson = (p: Person): Person => (p === 'vikas' ? 'varsha' : 'vikas')
