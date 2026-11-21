import { WEEKDAYS, type Person, type Profile, type Weekday } from '../types'
import { addDays, weekdayOf } from './calendar'
import { PROGRAMS } from './program'

/**
 * The calendar week (Mon to Sun) a person actually trains in.
 *
 * The programme is a fixed list of sessions (Mon Upper A ... Sat Active, Sun Rest). A permanent "day off" re-flows that list around the
 * off day (Fri off: Lower B moves to Sat, Active to Sun). Skipping a day pushes the rest of that week's sessions one slot later. Nothing
 * is stored except the skip itself (on the day record), so the plan always recomputes the same way on every phone.
 */
export interface SkipInfo { useOff?: boolean }
export interface Slot {
  date: string
  /** Calendar weekday of this slot. */
  day: Weekday
  /** Which programme session sits here (the Rest session on off days and empty slots). */
  session: Weekday
  /** The weekly day off, not used for training. */
  off: boolean
  /** "Not going today": the session shown is the one that was planned here, but it has moved. */
  skipped: boolean
  /** The off day, used for training this week because the user said yes. */
  usedOff: boolean
}
export interface WeekPlan { slots: Slot[]; dropped: Weekday[] }

export const offDayOf = (person: Person, profile?: Pick<Profile, 'offDay'>): Weekday | null => {
  const v = profile?.offDay
  if (v === 'none') return null
  if (v) return v
  return person === 'vikas' ? 'fri' : null
}

const restKey = (person: Person): Weekday => WEEKDAYS.find((d) => PROGRAMS[person].days[d].kind === 'rest') ?? 'sun'
const kindOf = (person: Person, s: Weekday) => PROGRAMS[person].days[s].kind
const isWorkout = (person: Person, s: Weekday) => kindOf(person, s) !== 'rest'

/** Normal week for a given off day: the sessions in order, laid onto every day except the off day. */
export function defaultLayout(person: Person, off: Weekday | null): { session: Weekday; off: boolean }[] {
  const rest = restKey(person)
  if (!off) return WEEKDAYS.map((d) => ({ session: d, off: false }))
  const seq = WEEKDAYS.filter((d) => isWorkout(person, d))
  const free = WEEKDAYS.filter((d) => d !== off)
  const lay = new Map<Weekday, { session: Weekday; off: boolean }>()
  free.forEach((d, i) => lay.set(d, { session: seq[i] ?? rest, off: false }))
  lay.set(off, { session: rest, off: true })
  return WEEKDAYS.map((d) => lay.get(d)!)
}

export const weekStartOf = (date: string) => addDays(date, -WEEKDAYS.indexOf(weekdayOf(date)))

export function weekPlan(person: Person, weekStart: string, off: Weekday | null, skips: Record<string, SkipInfo> = {}): WeekPlan {
  const rest = restKey(person)
  const lay = defaultLayout(person, off)
  const slots: Slot[] = lay.map((l, i) => ({ date: addDays(weekStart, i), day: WEEKDAYS[i], session: l.session, off: l.off, skipped: false, usedOff: false }))
  const offIdx = off ? WEEKDAYS.indexOf(off) : -1
  const dropped: Weekday[] = []
  for (let i = 0; i < 7; i++) {
    const sk = skips[slots[i].date]
    if (!sk) continue
    const cur = slots[i]
    if (cur.off || !isWorkout(person, cur.session)) { cur.skipped = true; continue }
    const queue: Weekday[] = [cur.session]
    for (let j = i + 1; j < 7; j++) if (!slots[j].off && isWorkout(person, slots[j].session)) queue.push(slots[j].session)
    // a day-off slot that was already opened by an earlier "yes" is a normal slot now; otherwise it opens only on a "yes" for this skip
    const open = (j: number) => !slots[j].off || (sk.useOff && j === offIdx)
    const avail: number[] = []
    for (let j = i + 1; j < 7; j++) if (open(j)) avail.push(j)
    while (queue.length > avail.length) {
      const k = [...queue].reverse().findIndex((s) => kindOf(person, s) === 'active')
      const at = k === -1 ? queue.length - 1 : queue.length - 1 - k
      dropped.push(queue.splice(at, 1)[0])
    }
    avail.forEach((j, n) => {
      const s = queue[n]
      slots[j] = { ...slots[j], session: s ?? rest, off: slots[j].off && !(sk.useOff && j === offIdx && s !== undefined), usedOff: slots[j].usedOff || (!!sk.useOff && j === offIdx && s !== undefined) }
    })
    slots[i] = { ...cur, skipped: true }   // keeps the planned session so it can still be shown as "moved"
  }
  return { slots, dropped }
}

/** Both outcomes of skipping `date`, and whether the user has to be asked about the day off. */
export function previewSkip(person: Person, date: string, off: Weekday | null, skips: Record<string, SkipInfo>) {
  const ws = weekStartOf(date), i = WEEKDAYS.indexOf(weekdayOf(date))
  const before = weekPlan(person, ws, off, skips).slots[i]
  const workout = !before.off && isWorkout(person, before.session) && !before.skipped
  const offAfter = !!off && WEEKDAYS.indexOf(off) > i
  return {
    workout,
    asksOff: workout && offAfter,
    no: weekPlan(person, ws, off, { ...skips, [date]: { useOff: false } }),
    yes: weekPlan(person, ws, off, { ...skips, [date]: { useOff: true } }),
  }
}

/** One short line per moved session, e.g. "Tue Upper A, Wed Lower A". */
export function describeMoves(person: Person, plan: WeekPlan, fromDate: string): string {
  const labels = plan.slots.filter((s) => s.date > fromDate && !s.off && isWorkout(person, s.session)).map((s) => `${s.day[0].toUpperCase()}${s.day.slice(1)} ${PROGRAMS[person].days[s.session].title}`)
  const drop = plan.dropped.map((d) => PROGRAMS[person].days[d].title)
  return labels.join(' · ') + (drop.length ? ` — dropped this week: ${drop.join(', ')}` : '')
}

/** True on days a lifting session is due (not rest, off, optional Active, or skipped). Used so a Friday off never breaks the streak. */
export function gymDayFn(person: Person, off: Weekday | null, skips: Record<string, SkipInfo>) {
  const cache = new Map<string, WeekPlan>()
  return (date: string) => {
    const ws = weekStartOf(date)
    let wp = cache.get(ws)
    if (!wp) { wp = weekPlan(person, ws, off, skips); cache.set(ws, wp) }
    const sl = wp.slots[WEEKDAYS.indexOf(weekdayOf(date))]
    const k = kindOf(person, sl.session)
    return !sl.off && !sl.skipped && k !== 'rest' && k !== 'active'
  }
}
