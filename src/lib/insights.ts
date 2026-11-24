import type { DayRow, Extra, WeightRow } from '../db'
import type { Person, Profile, SessionLog } from '../types'
import { WEEKDAYS } from '../types'
import { addDays, position } from '../engine/calendar'
import { bmr, scaleDay, targets } from '../engine/nutrition'
import { PLANS, dayMenu, optionById } from '../engine/rotation'
import { PROGRAMS } from '../engine/program'

/** Rough, honest estimates — good for trends, not for lab work. */
export const MET_STRENGTH = 5
export const MET_CARDIO = 6.5
export const KCAL_PER_STEP_PER_KG = 0.00057   // ≈ 0.04 kcal/step at 70 kg
export const BASE_FACTOR = 1.2                 // resting + daily living (no exercise, no steps)

export interface Settings { programStart: string; mergeDay0: boolean }
export interface DayStat {
  date: string
  eaten: number; protein: number
  workoutBurn: number; stepBurn: number; burn: number   // burn = base + workout + steps
  steps: number; water: number; minutes: number; volume: number; sessions: number
  logged: boolean
}

export const extrasOf = (row: Pick<DayRow, 'extras'> | undefined): { kcal: number; protein: number } =>
  (row?.extras ?? []).reduce((n, e: Extra) => ({ kcal: n.kcal + (e.kcal || 0), protein: n.protein + (e.protein || 0) }), { kcal: 0, protein: 0 })

/** kcal / protein eaten on a given day: ticked meals (portions scaled to the person's target, like the Diet tab) plus anything added as "ate something else". */
export function intakeOn(person: Person, row: DayRow | undefined, profile: Profile, st: Settings): { kcal: number; protein: number } {
  const ex = extrasOf(row)
  if (!row || !Object.values(row.eaten ?? {}).some(Boolean)) return { kcal: Math.round(ex.kcal), protein: Math.round(ex.protein) }
  const pos = position(row.date, st.programStart, st.mergeDay0)
  const wIdx = pos.phase === 'program' ? pos.weekInMonth : 1
  const dIdx = pos.phase === 'program' ? WEEKDAYS.indexOf(pos.weekday) : 6
  const plan = PLANS[person]
  const base = dayMenu(person, wIdx, dIdx, profile.veg)
  const picks = { ...base, ...(row.swaps ?? {}) }
  const chosen = plan.slots.map((s) => ({ slot: s.id, option: optionById(plan, picks[s.id]) ?? optionById(plan, base[s.id])! })).filter((c) => !!c.option)
  const sc = scaleDay(chosen, targets(person, profile).kcal)
  let kcal = ex.kcal, protein = ex.protein
  for (const c of chosen) if (row.eaten[c.slot]) { kcal += sc.kcal[c.slot] ?? 0; protein += sc.protein[c.slot] ?? 0 }
  return { kcal: Math.round(kcal), protein: Math.round(protein) }
}

export const sessionMinutes = (s: SessionLog) => (s.finishedAt && s.startedAt ? Math.min(150, Math.max(10, Math.round((s.finishedAt - s.startedAt) / 60000))) : 0)

export function sessionBurn(person: Person, s: SessionLog, kg: number): number {
  const kind = PROGRAMS[person].days[s.key as (typeof WEEKDAYS)[number]]?.kind
  const met = kind === 'cardio' ? MET_CARDIO : MET_STRENGTH
  return Math.round((met - 1) * kg * (sessionMinutes(s) / 60))   // net of resting, which BASE already counts
}

export function dayStats(person: Person, dates: string[], days: DayRow[], sessions: SessionLog[], weights: WeightRow[], profile: Profile, st: Settings): DayStat[] {
  const dayBy = new Map(days.map((d) => [d.date, d]))
  const sessBy = new Map<string, SessionLog[]>()
  for (const s of sessions) if (s.finishedAt) sessBy.set(s.date, [...(sessBy.get(s.date) ?? []), s])
  const wSorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const kgOn = (date: string) => { let kg = profile.weightKg; for (const w of wSorted) { if (w.date <= date) kg = w.kg; else break } return kg }
  return dates.map((date) => {
    const row = dayBy.get(date)
    const kg = kgOn(date)
    const { kcal, protein } = intakeOn(person, row, profile, st)
    const ss = sessBy.get(date) ?? []
    const cardioSec = (row?.cardio ?? []).reduce((n, e) => n + e.sec, 0)   // timed cardio logged on its own, outside a workout
    const workoutBurn = ss.reduce((n, s) => n + sessionBurn(person, s, kg), 0) + Math.round((MET_CARDIO - 1) * kg * (cardioSec / 3600))
    const steps = row?.steps ?? 0
    const stepBurn = Math.round(steps * KCAL_PER_STEP_PER_KG * kg)
    const base = Math.round(bmr({ ...profile, weightKg: kg }) * BASE_FACTOR)
    return {
      date, eaten: kcal, protein, workoutBurn, stepBurn, burn: base + workoutBurn + stepBurn,
      steps, water: (row?.water ?? 0) * 0.25, minutes: ss.reduce((n, s) => n + sessionMinutes(s), 0),
      volume: ss.reduce((n, s) => n + (s.volume ?? 0), 0), sessions: ss.length,
      logged: kcal > 0 || steps > 0 || ss.length > 0 || (row?.water ?? 0) > 0,
    }
  })
}

export const rangeDates = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)))

export interface Summary {
  daysLogged: number; avgEaten: number; avgBurn: number; avgProtein: number; avgSteps: number; avgWater: number
  workouts: number; minutes: number; volume: number; net: number | null
  /** days with food logged, and how many of those reached ≥90% of the protein target (set by the caller via `withTargets`) */
  eatDays: number
}
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
export function summarize(stats: DayStat[]): Summary {
  const eatDays = stats.filter((d) => d.eaten > 0)
  const logged = stats.filter((d) => d.logged)
  return {
    daysLogged: logged.length,
    avgEaten: avg(eatDays.map((d) => d.eaten)),
    avgBurn: avg(logged.map((d) => d.burn)),
    avgProtein: avg(eatDays.map((d) => d.protein)),
    avgSteps: avg(stats.filter((d) => d.steps > 0).map((d) => d.steps)),
    avgWater: Math.round(avg(stats.filter((d) => d.water > 0).map((d) => d.water * 100)) ) / 100,
    workouts: stats.reduce((n, d) => n + d.sessions, 0),
    minutes: stats.reduce((n, d) => n + d.minutes, 0),
    volume: Math.round(stats.reduce((n, d) => n + d.volume, 0)),
    // balance only over days where food was logged, so skipped logging doesn't look like a huge deficit
    eatDays: eatDays.length,
    net: eatDays.length ? Math.round(eatDays.reduce((n, d) => n + d.eaten - d.burn, 0) / eatDays.length) : null,
  }
}

export type Tone = 'good' | 'warn' | 'plain'
export interface Note { text: string; tone: Tone }

/** Is this balance (eaten − burnt) what the person is aiming for? Vikas is gaining, Varsha is cutting. */
export function balanceTone(person: Person, net: number | null): Tone {
  if (net == null) return 'plain'
  if (person === 'vikas') return net >= 100 ? 'good' : net < -100 ? 'warn' : 'plain'
  return net <= -150 ? (net < -900 ? 'warn' : 'good') : net > 100 ? 'warn' : 'plain'
}

/** Plain-language read-out of a period. Goal-aware: a surplus is good for Vikas and a deficit for Varsha. */
export function narrate(person: Person, stats: DayStat[], sum: Summary, t: { kcal: number; protein: number }, stepsGoal: number): Note[] {
  const out: Note[] = []
  const n = stats.length
  if (sum.daysLogged === 0) return out
  if (sum.eatDays > 0) {
    const gap = sum.avgEaten - t.kcal
    const pct = Math.abs(gap) / t.kcal
    if (pct <= 0.08) out.push({ text: `Eating right on target: about ${sum.avgEaten.toLocaleString('en-IN')} kcal a day against ${t.kcal.toLocaleString('en-IN')}.`, tone: 'good' })
    else if (gap < 0) out.push({ text: `About ${Math.abs(gap).toLocaleString('en-IN')} kcal a day under target${person === 'vikas' ? ', which slows a lean bulk. Add a snack or a bigger portion.' : '. Fine for fat loss unless you feel drained; don’t go lower.'}`, tone: person === 'vikas' ? 'warn' : pct > 0.25 ? 'warn' : 'good' })
    else out.push({ text: `About ${gap.toLocaleString('en-IN')} kcal a day over target${person === 'vikas' ? ', which is fine while bulking.' : ', which stalls fat loss. Check portions and extras.'}`, tone: person === 'vikas' ? 'good' : 'warn' })
    const proteinDays = stats.filter((d) => d.eaten > 0 && d.protein >= t.protein * 0.9).length
    out.push({ text: `Protein hit on ${proteinDays} of ${sum.eatDays} logged days (target ${t.protein} g).`, tone: proteinDays / sum.eatDays >= 0.7 ? 'good' : 'warn' })
  } else out.push({ text: 'No food logged in this period, so calories and protein can’t be read.', tone: 'warn' })
  const planned = Math.max(1, Math.round((n / 7) * Object.values(PROGRAMS[person].days).filter((d) => d.kind !== 'rest' && d.kind !== 'active').length))
  out.push({ text: `${sum.workouts} workout${sum.workouts === 1 ? '' : 's'} done out of about ${planned} planned.`, tone: sum.workouts >= planned * 0.8 ? 'good' : sum.workouts === 0 ? 'warn' : 'plain' })
  if (sum.avgSteps > 0) out.push({ text: `Steps average ${sum.avgSteps.toLocaleString('en-IN')} against a ${stepsGoal.toLocaleString('en-IN')} goal.`, tone: sum.avgSteps >= stepsGoal * 0.9 ? 'good' : 'plain' })
  if (sum.daysLogged < n * 0.5) out.push({ text: `Only ${sum.daysLogged} of ${n} days have anything logged, so treat these numbers as rough.`, tone: 'plain' })
  return out
}
