import type { LoadType } from '../types'

/** One past session of an exercise: the load used and the reps (or seconds) achieved per set. */
export interface Past { w: number; reps: number[] }
export interface Rx { reps?: [number, number]; hold?: [number, number]; sets: number; ex?: string }
/** Weight is entered per side / per hand (plates on each side of the leg press), so volume counts it twice. */
const EACH = new Set(['leg-press'])
export const isEach = (type: LoadType | undefined, ex?: string) => type === 'db' || (!!ex && EACH.has(ex))
export interface Suggestion {
  kind: 'first' | 'up' | 'stay' | 'down' | 'reset' | 'hold-up'
  weight: number | null
  text: string
  targets?: number[]
}

const round = (x: number, step: number) => Math.round(x / step) * step
export const stepFor = (t: LoadType, w = 0): number =>
  t === 'bb-upper' ? 2.5 : t === 'bb-lower' ? 5 : t === 'db' ? (w >= 10 ? 2 : 1) : t === 'machine' ? 5 : t === 'assist' ? 5 : 0
const fmt = (n: number) => `${Math.round(n * 100) / 100}`.replace(/\.0+$/, '')
const unit = (t: LoadType, each = false) => (each || t === 'db' ? ' kg each' : t === 'assist' ? ' kg assist' : ' kg')

/**
 * Double progression (Section 3).
 * history[0] is the most recent session. `reset` = Reset week (~90% of last loads).
 */
export function suggest(history: Past[], rx: Rx, type: LoadType, opts: { reset?: boolean } = {}): Suggestion {
  const each = isEach(type, rx.ex)
  const last = history[0]
  if (!last || !last.reps.length) {
    if (rx.hold) return { kind: 'first', weight: null, text: `Hold ${rx.hold[1]} s with good form. Stop when your hips sag.` }
    if (type === 'bw') return { kind: 'first', weight: null, text: `Aim for ${rx.reps?.[0] ?? 10}–${rx.reps?.[1] ?? 12} clean reps. Slow and controlled.` }
    return { kind: 'first', weight: null, text: 'Pick a weight you could lift ~15 times, then do 10.' }
  }

  if (rx.hold) {
    const [, hi] = rx.hold
    const done = last.reps.length >= rx.sets && last.reps.every((s) => s >= hi)
    const prev = Math.max(hi, ...last.reps)
    return done
      ? { kind: 'hold-up', weight: null, text: `↑ Try ${prev + 10} s today`, targets: Array(rx.sets).fill(prev + 10) }
      : { kind: 'stay', weight: null, text: `Hold ${hi} s on every set`, targets: Array(rx.sets).fill(hi) }
  }

  const [lo, hi] = rx.reps ?? [8, 10]
  const w = last.w
  const allTop = last.reps.length >= Math.min(rx.sets, last.reps.length) && last.reps.every((r) => r >= hi)
  const below = (p?: Past) => !!p && p.reps.some((r) => r < lo)
  const aim = (reps: number[]) => Array.from({ length: rx.sets }, (_, i) => Math.min(hi, Math.max(lo, (reps[i] ?? reps[reps.length - 1] ?? lo) + 1)))

  if (type === 'bw') {
    return allTop
      ? { kind: 'up', weight: null, text: 'All sets at the top — make it harder (lower incline, slower, or straighter legs)' }
      : { kind: 'stay', weight: null, text: `Aim for ${aim(last.reps).join(' · ')}`, targets: aim(last.reps) }
  }

  if (opts.reset && w > 0) {
    const step = type === 'machine' || type === 'assist' ? 5 : type === 'db' ? 1 : 2.5
    const rw = type === 'assist' ? round(w * 1.1, step) : Math.max(step, round(w * 0.9, step))
    return { kind: 'reset', weight: rw, text: `Reset week — ${fmt(rw)}${unit(type, each)} (≈90%)`, targets: Array(rx.sets).fill(lo) }
  }

  if (allTop) {
    if (type === 'assist') {
      const nw = Math.max(0, w - 5)
      return { kind: 'up', weight: nw, text: nw === 0 ? '↑ Try it with no assistance today' : `↑ Drop assistance to ${fmt(nw)} kg`, targets: Array(rx.sets).fill(lo) }
    }
    const nw = w + stepFor(type, w)
    const text = type === 'machine' ? `↑ Go up 1 pin (≈${fmt(nw)} kg) today` : `↑ Try ${fmt(nw)}${unit(type, each)} today`
    return { kind: 'up', weight: nw, text, targets: Array(rx.sets).fill(lo) }
  }

  if (below(history[0]) && below(history[1]) && history[1].w >= w) {
    if (type === 'assist') {
      const nw = w + 5
      return { kind: 'down', weight: nw, text: `Add assistance: ${fmt(nw)} kg, then rebuild`, targets: Array(rx.sets).fill(lo) }
    }
    const step = type === 'machine' ? 5 : type === 'db' ? 1 : 2.5
    const nw = Math.max(step, round(w * 0.9, step))
    return { kind: 'down', weight: nw, text: `↓ Drop to ${fmt(nw)}${unit(type, each)} (−10%) and rebuild`, targets: Array(rx.sets).fill(hi) }
  }

  const t = aim(last.reps)
  return { kind: 'stay', weight: w, text: `Stay at ${fmt(w)}${unit(type, each)} — aim for ${t.join(' · ')}`, targets: t }
}

export const lastLine = (p: Past | undefined, isHold = false): string =>
  !p ? '' : isHold ? `Last: ${p.reps.join(' · ')} s` : `Last: ${p.w ? `${fmt(p.w)} kg × ` : ''}${p.reps.join(' · ')}`

/** Ramp-up sets on the first ★ lift: ~50% × 8, ~70% × 5, ~85% × 2. */
export function rampSets(working: number, type: LoadType): { w: number; reps: number }[] {
  const step = type === 'db' ? 1 : type === 'machine' ? 5 : 2.5
  const min = type === 'bb-upper' || type === 'bb-lower' ? 20 : step
  return [[0.5, 8], [0.7, 5], [0.85, 2]].map(([p, r]) => ({ w: Math.max(min, round(working * p, step)), reps: r }))
}

/** Estimated 1RM (Epley) — used only to compare sets for PRs, never to prescribe a max. */
export const e1rm = (w: number, r: number) => (r <= 0 ? 0 : w * (1 + r / 30))

/** A set is a PR if it beats the best previous load at ≥ same reps, or reps at ≥ same load. */
export function isPR(prev: { w: number; r: number }[], w: number, r: number): boolean {
  if (!prev.length || w <= 0 || r <= 0) return false
  return prev.every((p) => !(p.w >= w && p.r >= r))
}
