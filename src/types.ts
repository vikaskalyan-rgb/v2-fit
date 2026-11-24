export type Person = 'vikas' | 'varsha'
export const PEOPLE: Person[] = ['vikas', 'varsha']
export const NAME: Record<Person, string> = { vikas: 'Vikas', varsha: 'Varsha' }

export type MuscleId =
  | 'upper-traps' | 'mid-traps-rhomboids' | 'front-delts' | 'side-delts' | 'rear-delts'
  | 'upper-chest' | 'mid-lower-chest' | 'biceps' | 'brachialis' | 'forearms' | 'triceps'
  | 'lats' | 'lower-back' | 'abs' | 'obliques' | 'glutes' | 'glute-med' | 'hip-flexors'
  | 'adductors' | 'quads' | 'hamstrings' | 'calves' | 'soleus'

/** How load progresses. See engine/progression.ts */
export type LoadType = 'bb-upper' | 'bb-lower' | 'db' | 'machine' | 'assist' | 'bw' | 'hold' | 'cardio'

export interface MediaSet { video?: string; poster?: string }
export interface Exercise {
  id: string
  name: string
  equipment: string[]
  muscles: { primary: MuscleId[]; secondary: MuscleId[] }
  howTo: string[]
  cues: string[]
  mistakes: string[]
  breathing: string
  tempo: string
  alternatives: string[]
  startingTip: string
  safety: string
  loadType: LoadType
  mediaNote?: string
  media: { male?: MediaSet; female?: MediaSet; fallback?: [string, string] }
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const WD_LABEL: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }

/** One prescribed movement. reps = [lo, hi]; hold = seconds [lo, hi]. */
export interface Lift {
  ex: string
  sets: number
  reps?: [number, number]
  hold?: [number, number]
  rest: number
  star?: boolean
  perSide?: boolean
  note?: string
  /** Use a simpler variant until a profile flag is ticked (e.g. trainer-approved squat). */
  gate?: { flag: 'squatApproved'; label: string; use: Partial<Lift> }
}
export interface Intervals { work: number; easy: number; rounds: number; roundsByWeek?: number[]; workLabel: string; easyLabel: string }
export type Block =
  | ({ type: 'lift' } & Lift)
  | { type: 'superset'; rest: number; items: Lift[] }
  | { type: 'circuit'; rounds: number; rest: number; items: { ex: string; reps?: number; hold?: number; perSide?: boolean; note?: string }[] }
  | { type: 'cardio'; ex: string; minutes: number; minutesByWeek?: number[]; label: string; note?: string; intervals?: Intervals }
  | { type: 'mobility'; minutes: number; label: string }

export interface SessionDef {
  key: string
  title: string
  subtitle?: string
  minutes: number
  kind: 'upper' | 'lower' | 'cardio' | 'full' | 'active' | 'rest' | 'day0' | 'core'
  blocks: Block[]
  note?: string
}

export interface WeekMod { name: 'Learn' | 'Reset' | 'Build' | 'Push' | 'Prove'; rir: string; hint: string }

/** A flattened, resolved thing to do in session mode. */
export interface Step {
  id: string
  ex: string
  kind: 'lift' | 'cardio' | 'mobility'
  label?: string
  group?: string
  groupKind?: 'superset' | 'circuit'
  rounds?: number
  sets: number
  reps?: [number, number]
  hold?: [number, number]
  rest: number
  star?: boolean
  perSide?: boolean
  note?: string
  minutes?: number
  intervals?: Intervals
  gate?: { flag: 'squatApproved'; label: string }
}

/** Month 2 / Month 3 changes applied on top of the Month 1 days. */
export interface MonthPatch {
  /** exerciseId → replacement fields (ex, sets, reps, note…) */
  swap?: Record<string, Partial<Lift>>
  /** replace a whole day's blocks */
  replace?: Partial<Record<Weekday, Block[]>>
  /** add blocks at the start of a day */
  prepend?: Partial<Record<Weekday, Block[]>>
  circuitRounds?: number
  note?: string
}
export interface ProgramDef {
  person: Person
  days: Record<Weekday, SessionDef>
  months: { 2: MonthPatch; 3: MonthPatch }
  day0: Block[]
  milestones: { id: string; label: string }[]
  why?: string[]
}

export interface SetLog { w: number; r: number; done: boolean; t?: number }
export interface SessionLog {
  id: string
  person: Person
  date: string
  key: string
  title: string
  cycle: number
  weekIndex: number
  startedAt: number
  finishedAt?: number
  sets: Record<string, SetLog[]>
  exOf: Record<string, string>
  /** Seconds spent on each cardio step (treadmill, bike…), by step id. */
  cardio?: Record<string, number>
  mood?: number
  energy?: number
  notes?: string
  volume?: number
  prs?: string[]
  updatedAt: number
}

export interface Profile {
  heightCm: number
  weightKg: number
  age: number
  sex: 'male' | 'female'
  gymTime: string
  veg: boolean
  kcalAdjust: number
  /** Hide this person's body weight when the other person's phone views them. A courtesy, not a lock. */
  hideWeight?: boolean
  lastAdjust?: string
  adjustReason?: string
  squatApproved?: boolean
  /** A separate daily Core & Abs session. Unset = on for Vikas, off for Varsha. */
  dailyCore?: boolean
  /** Daily cardio target in minutes (0 = off). Unset = 30 for Vikas, 0 for Varsha. */
  cardioDaily?: number
  onboarded: boolean
  /** Editable targets (fall back to the coach's defaults when unset) */
  waterL?: number
  stepsTarget?: number
  proteinPerKg?: number
  /** Weekly day off. Unset = the household default (Vikas: Friday); 'none' = no fixed day off. */
  offDay?: Weekday | 'none'
}
