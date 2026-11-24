import type { Block, Person, Profile } from '../types'

/** The daily Core & Abs session is stored as its own session log with this key, apart from the weekly program. */
export const CORE_KEY = 'core'
export const CORE_TITLE = 'Core & Abs'
export const CORE_MINUTES = 15

const L = (ex: string, sets: number, reps: [number, number], rest: number, note?: string): Block => ({ type: 'lift', ex, sets, reps, rest, ...(note ? { note } : {}) })
const hold = (ex: string, sets: number, sec: number, rest: number, extra: { perSide?: boolean; note?: string } = {}): Block => ({ type: 'lift', ex, sets, hold: [sec, sec], rest, ...extra })

/** Five moves covering the upper abs, lower abs, deep core and obliques. Months 2 and 3 make them harder. */
export function coreBlocks(month: number): Block[] {
  return [
    month >= 2 ? L('hanging-leg-raise', 3, [10, 15], 60, 'Bent knees to straight legs as you get stronger') : L('hanging-knee-raise', 3, [12, 15], 60, 'Curl the pelvis up, don’t swing'),
    L('cable-crunch', 3, [12, 15], 60, 'Hips still, curl the ribs to the pelvis'),
    month >= 2 ? L('ab-wheel-rollout', 3, [8, 12], 60, 'From the knees. Stop before your lower back sags.') : L('dead-bug', 3, [10, 10], 45, 'Slow. Press the lower back into the floor.'),
    hold('plank', 3, month >= 3 ? 60 : month === 2 ? 50 : 40, 45, { note: 'Squeeze glutes, ribs down' }),
    hold('side-plank', 2, month >= 3 ? 40 : 30, 30, { perSide: true, note: 'Each side' }),
  ]
}

export const DEFAULT_CARDIO_MIN = 30
export const coreOn = (person: Person, p: Pick<Profile, 'dailyCore'>) => p.dailyCore ?? person === 'vikas'
export const cardioTarget = (person: Person, p: Pick<Profile, 'cardioDaily'>) => p.cardioDaily ?? (person === 'vikas' ? DEFAULT_CARDIO_MIN : 0)
