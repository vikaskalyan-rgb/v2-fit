import type { Block, Lift, Person, ProgramDef, SessionDef, Step, WeekMod, Weekday, MuscleId } from '../types'
import { WEEK_MODS } from '../data/common'
import { vikasProgram } from '../data/program.vikas'
import { varshaProgram } from '../data/program.varsha'
import { EX } from '../data/exercises'
import { CORE_KEY, CORE_MINUTES, CORE_TITLE, coreBlocks } from '../data/core'

/** The coach's plan, never mutated. */
export const DEFAULT_PROGRAMS: Record<Person, ProgramDef> = { vikas: vikasProgram, varsha: varshaProgram }
/** The plan in use — the coach's plan, or your edited copy (see lib/content.ts). */
export const PROGRAMS: Record<Person, ProgramDef> = { ...DEFAULT_PROGRAMS }

export function weekMod(month: number, weekInMonth: number): WeekMod {
  if (weekInMonth === 1) return month === 1 ? WEEK_MODS.Learn : WEEK_MODS.Reset
  if (weekInMonth === 2) return WEEK_MODS.Build
  return weekInMonth === 3 ? WEEK_MODS.Push : WEEK_MODS.Prove
}

/** Sets after the week modifier. Learn: base−1 (min 2). Push/Prove: +1 on ★ lifts. */
export function modSets(base: number, star: boolean | undefined, mod: WeekMod): number {
  if (mod.name === 'Learn') return Math.max(2, base - 1)
  if ((mod.name === 'Push' || mod.name === 'Prove') && star) return base + 1
  return base
}

export interface Flags { squatApproved?: boolean }
export interface Resolved { def: SessionDef; steps: Step[]; mod: WeekMod; month: number; weekInMonth: number }

function applySwap(l: Lift, swap: Record<string, Partial<Lift>> | undefined): Lift {
  const s = swap?.[l.ex]
  return s ? { ...l, ...s } : l
}

export function monthBlocks(person: Person, month: number, weekday: Weekday): Block[] {
  const p = PROGRAMS[person]
  const base = p.days[weekday].blocks
  if (month === 1) return base
  const patch = p.months[month as 2 | 3]
  const replaced = patch.replace?.[weekday]
  let blocks: Block[] = (replaced ?? base).map((b) => {
    if (b.type === 'lift') return { type: 'lift', ...applySwap(b, patch.swap) } as Block
    if (b.type === 'superset') return { ...b, items: b.items.map((i) => applySwap(i, patch.swap)) }
    if (b.type === 'circuit' && patch.circuitRounds && !replaced) return { ...b, rounds: patch.circuitRounds }
    return b
  })
  if (patch.prepend?.[weekday]) blocks = [...patch.prepend[weekday]!, ...blocks]
  return blocks
}

export function toSteps(blocks: Block[], mod: WeekMod | null, weekInMonth: number, flags: Flags = {}): Step[] {
  const steps: Step[] = []
  let g = 0
  const lift = (l: Lift, i: string, extra: Partial<Step> = {}): Step => {
    let x = l
    let gate: Step['gate']
    if (l.gate && !flags[l.gate.flag]) { x = { ...l, ...l.gate.use }; gate = { flag: l.gate.flag, label: l.gate.label } }
    return {
      id: i, ex: x.ex, kind: 'lift', sets: mod ? modSets(x.sets, x.star, mod) : x.sets, reps: x.reps, hold: x.hold,
      rest: x.rest, star: x.star, perSide: x.perSide, note: x.note, gate, ...extra,
    }
  }
  blocks.forEach((b, bi) => {
    if (b.type === 'lift') steps.push(lift(b, `${bi}`))
    else if (b.type === 'superset') {
      const letter = String.fromCharCode(65 + g++)
      b.items.forEach((it, ii) => steps.push(lift(it, `${bi}.${ii}`, { group: letter, groupKind: 'superset', label: `${letter}${ii + 1}`, rest: ii === b.items.length - 1 ? b.rest : 0 })))
    } else if (b.type === 'circuit') {
      const letter = String.fromCharCode(65 + g++)
      b.items.forEach((it, ii) => steps.push({
        id: `${bi}.${ii}`, ex: it.ex, kind: 'lift', sets: b.rounds, rounds: b.rounds,
        reps: it.reps ? [it.reps, it.reps] : undefined, hold: it.hold ? [it.hold, it.hold] : undefined,
        rest: ii === b.items.length - 1 ? b.rest : 0, perSide: it.perSide, note: it.note,
        group: letter, groupKind: 'circuit', label: `${letter}${ii + 1}`,
      }))
    } else if (b.type === 'cardio') {
      const iv = b.intervals ? { ...b.intervals, rounds: b.intervals.roundsByWeek?.[weekInMonth - 1] ?? b.intervals.rounds } : undefined
      const minutes = iv ? Math.round((iv.rounds * (iv.work + iv.easy)) / 60) : b.minutesByWeek?.[weekInMonth - 1] ?? b.minutes
      steps.push({ id: `${bi}`, ex: b.ex, kind: 'cardio', label: b.label, note: b.note, sets: 1, rest: 0, minutes, intervals: iv })
    } else steps.push({ id: `${bi}`, ex: 'mobility', kind: 'mobility', label: b.label, sets: 1, rest: 0, minutes: b.minutes })
  })
  return steps
}

export function resolveSession(person: Person, weekIndex: number, weekday: Weekday, flags: Flags = {}): Resolved {
  const month = Math.ceil(weekIndex / 4)
  const weekInMonth = ((weekIndex - 1) % 4) + 1
  const mod = weekMod(month, weekInMonth)
  const def = PROGRAMS[person].days[weekday]
  const blocks = monthBlocks(person, month, weekday)
  return { def: { ...def, blocks }, steps: toSteps(blocks, mod, weekInMonth, flags), mod, month, weekInMonth }
}

export function resolveCore(weekIndex: number): Resolved {
  const month = Math.ceil(weekIndex / 4)
  const weekInMonth = ((weekIndex - 1) % 4) + 1
  const blocks = coreBlocks(month)
  const def: SessionDef = { key: CORE_KEY, title: CORE_TITLE, subtitle: 'Daily, separate from your lifting', minutes: CORE_MINUTES, kind: 'core', blocks }
  return { def, steps: toSteps(blocks, null, weekInMonth), mod: { name: 'Build', rir: '1–2', hint: 'Slow and controlled. Exhale as you curl. Stop a rep or two before form breaks.' }, month, weekInMonth }
}

export function resolveDay0(person: Person): Resolved {
  const blocks = PROGRAMS[person].day0
  const def: SessionDef = { key: 'day0', title: 'Day 0 — Orientation', subtitle: 'Baseline, gym tour & starting weights', minutes: 45, kind: 'day0', blocks }
  return { def, steps: toSteps(blocks, null, 1), mod: { name: 'Learn', rir: '4–5', hint: 'Light and easy. Today is about finding starting weights.' }, month: 1, weekInMonth: 1 }
}

/** Sets per muscle for a list of steps (primary = 1, secondary = 0.5). */
export function muscleSets(steps: Step[]): Partial<Record<MuscleId, number>> {
  const out: Partial<Record<MuscleId, number>> = {}
  for (const s of steps) {
    const e = EX[s.ex]
    if (!e || s.kind !== 'lift') continue
    e.muscles.primary.forEach((m) => (out[m] = (out[m] ?? 0) + s.sets))
    e.muscles.secondary.forEach((m) => (out[m] = (out[m] ?? 0) + s.sets * 0.5))
  }
  return out
}
export function sessionMuscles(steps: Step[]): { primary: MuscleId[]; secondary: MuscleId[] } {
  const p = new Set<MuscleId>(), s = new Set<MuscleId>()
  steps.forEach((st) => { const e = EX[st.ex]; if (!e) return; e.muscles.primary.forEach((m) => p.add(m)); e.muscles.secondary.forEach((m) => s.add(m)) })
  p.forEach((m) => s.delete(m))
  return { primary: [...p], secondary: [...s] }
}

export const rxText = (s: Step): string => {
  if (s.kind !== 'lift') return s.minutes ? `${s.minutes} min` : ''
  const per = s.perSide ? ' / side' : ''
  if (s.hold) return `${s.sets} × ${s.hold[0] === s.hold[1] ? s.hold[0] : `${s.hold[0]}–${s.hold[1]}`} s${per}`
  const r = s.reps!
  return `${s.sets} × ${r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`}${per}`
}
export const restText = (sec: number) => (sec >= 120 ? `${Math.round(sec / 30) / 2} min` : `${sec} s`)
