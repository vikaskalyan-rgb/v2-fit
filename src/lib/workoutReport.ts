import type { DayRow } from '../db'
import type { MuscleId, Person, SessionLog } from '../types'
import { EX } from '../data/exercises'
import { MUSCLE_INFO } from '../data/common'
import { addDays, weekdayOf } from '../engine/calendar'
import { isEach } from '../engine/progression'
import { cardioTotals } from './cardio'
import { MET_CARDIO, MET_STRENGTH, sessionMinutes } from './insights'

/**
 * Everything the workout report prints, computed from the logs alone (no food, no steps).
 * A set credits its exercise's primary muscles with 1 direct set and the secondary muscles with 1 indirect set.
 */
export type Group = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core'
export const GROUPS: Group[] = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core']
export const GROUP_OF: Record<MuscleId, Group> = {
  'upper-chest': 'Chest', 'mid-lower-chest': 'Chest',
  'lats': 'Back', 'mid-traps-rhomboids': 'Back', 'upper-traps': 'Back', 'lower-back': 'Back',
  'front-delts': 'Shoulders', 'side-delts': 'Shoulders', 'rear-delts': 'Shoulders',
  'biceps': 'Arms', 'brachialis': 'Arms', 'triceps': 'Arms', 'forearms': 'Arms',
  'quads': 'Legs', 'hamstrings': 'Legs', 'glutes': 'Legs', 'glute-med': 'Legs', 'adductors': 'Legs', 'calves': 'Legs', 'soleus': 'Legs', 'hip-flexors': 'Legs',
  'abs': 'Core', 'obliques': 'Core',
}
export const PUSH: Group[] = ['Chest', 'Shoulders']   // pressing
export const muscleName = (m: string) => MUSCLE_INFO[m]?.name ?? m

export interface ExRow { ex: string; name: string; sets: { w: number; r: number }[]; kind: 'load' | 'bw' | 'hold' | 'cardio'; each: boolean; volume: number; reps: number; seconds: number; pr: boolean; primary: MuscleId[]; secondary: MuscleId[] }
export interface SessionRep {
  id: string; date: string; title: string; key: string; minutes: number; kcal: number
  sets: number; reps: number; volume: number; prs: string[]; cardioSec: number
  rows: ExRow[]
  /** direct / indirect sets per muscle in this session */
  direct: Partial<Record<MuscleId, number>>; indirect: Partial<Record<MuscleId, number>>
}
export interface MuscleRow { id: MuscleId; name: string; group: Group; direct: number; indirect: number; reps: number; volume: number; sessions: number; last: string }
export interface Report {
  from: string; to: string; days: number
  sessions: SessionRep[]
  totals: { workouts: number; planned: number; minutes: number; avgMinutes: number; kcal: number; sets: number; reps: number; volume: number; prs: number; cardioSec: number; cardioKcal: number; musclesHit: number; activeDays: number }
  muscles: MuscleRow[]
  /** per-muscle intensity 0..1 for the whole period (direct + half of indirect, relative to the most trained muscle) */
  heat: Partial<Record<MuscleId, number>>
  groups: { group: Group; sets: number; share: number }[]
  weeks: { label: string; start: string; workouts: number; sets: number; volume: number; minutes: number }[]
  lifts: { ex: string; name: string; best: string; bestW: number; volume: number; sets: number; date: string }[]
  calendar: { date: string; day: string; sessions: string[]; skipped: boolean }[]
  cardio: { ex: string; name: string; sec: number; kcal: number }[]
  untrained: MuscleId[]
}

export const ALL_MUSCLES = Object.keys(MUSCLE_INFO) as MuscleId[]
const round1 = (n: number) => Math.round(n * 10) / 10

export function buildReport(o: { person: Person; sessions: SessionLog[]; days: DayRow[]; from: string; to: string; kgOn: (date: string) => number; planned: number; names?: Record<string, string> }): Report {
  const { from, to } = o
  const all = o.sessions.filter((s) => s.finishedAt && s.date >= from && s.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
  const muscle = new Map<MuscleId, MuscleRow>()
  const row = (id: MuscleId): MuscleRow => { let m = muscle.get(id); if (!m) { m = { id, name: muscleName(id), group: GROUP_OF[id] ?? 'Core', direct: 0, indirect: 0, reps: 0, volume: 0, sessions: 0, last: '' }; muscle.set(id, m) } return m }
  const liftAgg = new Map<string, { volume: number; sets: number; bestW: number; best: string; date: string }>()
  let cardioKcal = 0

  const sessions: SessionRep[] = all.map((s) => {
    const rows: ExRow[] = []
    const direct: SessionRep['direct'] = {}, indirect: SessionRep['indirect'] = {}
    const kg = o.kgOn(s.date)
    let sets = 0, reps = 0, volume = 0, cardioSec = 0
    // keep the programme's order: step ids sort by creation order in the log object
    for (const [stepId, list] of Object.entries(s.sets)) {
      const ex = EX[s.exOf[stepId]]
      if (!ex) continue
      const done = list.filter((x) => x.done)
      if (!done.length) continue
      const kind = ex.loadType === 'hold' ? 'hold' : ex.loadType === 'bw' ? 'bw' : 'load'
      const each = isEach(ex.loadType, ex.id)
      const vol = kind === 'load' && ex.loadType !== 'assist' ? done.reduce((a, x) => a + x.w * x.r * (each ? 2 : 1), 0) : 0
      const rp = kind === 'hold' ? 0 : done.reduce((a, x) => a + x.r, 0)
      const sec = kind === 'hold' ? done.reduce((a, x) => a + x.r, 0) : 0
      const best = kind === 'load' ? [...done].sort((a, b) => b.w - a.w || b.r - a.r)[0] : null
      rows.push({ ex: ex.id, name: ex.name, sets: done.map((x) => ({ w: x.w, r: x.r })), kind, each, volume: vol, reps: rp, seconds: sec, pr: !!s.prs?.includes(ex.id) || !!s.prs?.includes(stepId),
        primary: ex.muscles.primary, secondary: ex.muscles.secondary })
      sets += done.length; reps += rp; volume += vol
      for (const m of ex.muscles.primary) { direct[m] = (direct[m] ?? 0) + done.length; const r = row(m); r.direct += done.length; r.reps += rp; r.volume += vol }
      for (const m of ex.muscles.secondary) { if (ex.muscles.primary.includes(m)) continue; indirect[m] = (indirect[m] ?? 0) + done.length; row(m).indirect += done.length }
      const a = liftAgg.get(ex.id) ?? { volume: 0, sets: 0, bestW: 0, best: '', date: '' }
      a.volume += vol; a.sets += done.length
      if (best && (best.w > a.bestW || (best.w === a.bestW && !a.best))) { a.bestW = best.w; a.best = `${best.w} kg${each ? ' each' : ''} x ${best.r}`; a.date = s.date }
      liftAgg.set(ex.id, a)
    }
    for (const [stepId, sec] of Object.entries(s.cardio ?? {})) {
      const ex = EX[s.exOf[stepId]]
      if (!ex || sec <= 0) continue
      cardioSec += sec
      rows.push({ ex: ex.id, name: ex.name, sets: [], kind: 'cardio', each: false, volume: 0, reps: 0, seconds: sec, pr: false, primary: [], secondary: [] })
    }
    const minutes = sessionMinutes(s)
    const kcal = Math.round((MET_STRENGTH - 1) * kg * (minutes / 60))
    for (const m of new Set([...Object.keys(direct), ...Object.keys(indirect)] as MuscleId[])) { const r = row(m); r.sessions += 1; if (s.date > r.last) r.last = s.date }
    return { id: s.id, date: s.date, title: s.title, key: s.key, minutes, kcal, sets, reps, volume: Math.round(volume), prs: s.prs ?? [], cardioSec, rows, direct, indirect }
  })

  const ct = cardioTotals(o.sessions, o.days, from, to)
  const cardio = Object.entries(ct.byEx).map(([ex, sec]) => { const kg = o.kgOn(to); const kcal = Math.round((MET_CARDIO - 1) * kg * (sec / 3600)); cardioKcal += kcal; return { ex, name: EX[ex]?.name ?? ex, sec, kcal } }).sort((a, b) => b.sec - a.sec)

  const muscles = [...muscle.values()].map((m) => ({ ...m, volume: Math.round(m.volume) })).sort((a, b) => (b.direct + b.indirect * 0.5) - (a.direct + a.indirect * 0.5))
  const score = (m: MuscleRow) => m.direct + m.indirect * 0.5
  const top = Math.max(1, ...muscles.map(score))
  const heat: Report['heat'] = {}
  for (const m of muscles) heat[m.id] = Math.min(1, score(m) / top)
  const gSets: Record<Group, number> = { Chest: 0, Back: 0, Shoulders: 0, Arms: 0, Legs: 0, Core: 0 }
  for (const m of muscles) gSets[m.group] += m.direct
  const gTotal = Object.values(gSets).reduce((a, b) => a + b, 0) || 1
  const groups = GROUPS.map((group) => ({ group, sets: gSets[group], share: gSets[group] / gTotal }))

  const dates: string[] = []
  for (let d = from; d <= to && dates.length < 400; d = addDays(d, 1)) dates.push(d)
  const weeks: Report['weeks'] = []
  for (let i = 0; i < dates.length; i += 7) {
    const span = dates.slice(i, i + 7), ss = sessions.filter((s) => s.date >= span[0] && s.date <= span[span.length - 1])
    weeks.push({ label: `${span[0].slice(8)}/${span[0].slice(5, 7)}`, start: span[0], workouts: ss.length, sets: ss.reduce((a, s) => a + s.sets, 0), volume: ss.reduce((a, s) => a + s.volume, 0), minutes: ss.reduce((a, s) => a + s.minutes, 0) })
  }
  const skipped = new Set(o.days.filter((d) => d.skip).map((d) => d.date))
  const calendar = dates.map((date) => ({ date, day: weekdayOf(date), sessions: sessions.filter((s) => s.date === date).map((s) => s.title), skipped: skipped.has(date) }))
  const lifts = [...liftAgg.entries()].map(([ex, a]) => ({ ex, name: EX[ex]?.name ?? ex, best: a.best, bestW: a.bestW, volume: Math.round(a.volume), sets: a.sets, date: a.date })).filter((l) => l.sets > 0).sort((a, b) => b.volume - a.volume)

  const minutes = sessions.reduce((a, s) => a + s.minutes, 0)
  return {
    from, to, days: dates.length, sessions, muscles, heat, groups, weeks, lifts, calendar, cardio,
    untrained: ALL_MUSCLES.filter((m) => !muscle.has(m)),
    totals: {
      workouts: sessions.length, planned: o.planned, minutes, avgMinutes: sessions.length ? Math.round(minutes / sessions.length) : 0,
      kcal: sessions.reduce((a, s) => a + s.kcal, 0), sets: sessions.reduce((a, s) => a + s.sets, 0), reps: sessions.reduce((a, s) => a + s.reps, 0),
      volume: sessions.reduce((a, s) => a + s.volume, 0), prs: sessions.reduce((a, s) => a + s.prs.length, 0),
      cardioSec: ct.seconds, cardioKcal, musclesHit: muscles.length, activeDays: new Set(sessions.map((s) => s.date)).size,
    },
  }
}

/** Plain-language reading of the balance, for the report. */
export function balanceNotes(r: Report): string[] {
  const out: string[] = []
  const g = Object.fromEntries(r.groups.map((x) => [x.group, x.sets])) as Record<Group, number>
  const total = r.groups.reduce((a, x) => a + x.sets, 0)
  if (!total) return ['No completed lifting sets in this period.']
  const push = g.Chest + g.Shoulders, pull = g.Back
  if (pull > 0 || push > 0) {
    const ratio = pull ? round1(push / pull) : null
    out.push(ratio === null ? 'Pressing only: add rows or pull-downs for shoulder health.' : ratio > 1.5 ? `Pressing (${push} sets) outweighs back work (${pull}) by ${ratio} to 1. Add rows or pull-downs to protect the shoulders.` : ratio < 0.67 ? `Back work (${pull} sets) is well ahead of pressing (${push}).` : `Pressing (${push}) and back work (${pull}) are well balanced.`)
  }
  const lower = g.Legs, upper = total - g.Legs - g.Core
  out.push(lower < upper * 0.4 ? `Legs got ${lower} direct sets against ${upper} for the upper body. Legs are the biggest muscle group, so they can take more.` : `Legs (${lower} sets) and upper body (${upper}) are in proportion.`)
  const low = r.groups.filter((x) => x.sets === 0).map((x) => x.group)
  if (low.length) out.push(`No direct work for: ${low.join(', ')}.`)
  if (r.untrained.length) out.push(`Not trained at all: ${r.untrained.map(muscleName).join(', ')}.`)
  return out
}

const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min} min`)
export const fmtHM = hm
export const fmtMS = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/** The 3 to 5 things worth knowing, in plain words. */
export function findings(r: Report): string[] {
  const t = r.totals, out: string[] = []
  if (!t.workouts) return ['No workouts were completed in this period.']
  const planned = Math.max(t.planned, t.workouts), pct = planned ? Math.round((t.workouts / planned) * 100) : null
  out.push(pct === null ? `${t.workouts} workouts completed.` : `${t.workouts} of ${planned} planned workouts completed (${pct}%).` + (pct >= 85 ? ' Excellent consistency.' : pct >= 60 ? ' Solid, with room to be more consistent.' : ' Consistency is the biggest lever right now.'))
  out.push(`${t.sets} working sets and ${t.reps.toLocaleString('en-IN')} reps moved ${t.volume.toLocaleString('en-IN')} kg in ${hm(t.minutes)} of training, averaging ${hm(t.avgMinutes)} and about ${Math.round(t.kcal / t.workouts)} kcal per session.`)
  const [a, b] = [r.muscles[0], r.muscles[r.muscles.length - 1]]
  if (a) out.push(`Most worked: ${a.name} (${a.direct} direct sets).` + (b && b.id !== a.id ? ` Least worked: ${b.name} (${b.direct} direct, ${b.indirect} indirect).` : ''))
  if (t.prs) out.push(`${t.prs} personal record${t.prs > 1 ? 's' : ''} set in this period.`)
  out.push(...balanceNotes(r).slice(0, 2))
  return out
}
