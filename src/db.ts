import Dexie, { liveQuery, type Table } from 'dexie'
import { useEffect, useState } from 'react'
import type { Person, SessionLog } from './types'

export interface WeightRow { id: string; person: Person; date: string; kg: number; updatedAt: number }
export interface MeasureRow { id: string; person: Person; date: string; v: Record<string, number>; updatedAt: number }
export interface PhotoRow { id: string; person: Person; date: string; pose: string; blob: Blob; updatedAt: number }
export interface DayRow {
  id: string; person: Person; date: string
  eaten: Record<string, boolean>; swaps: Record<string, string>
  water: number; steps: number; creatine?: boolean; updatedAt: number
  /** Things eaten outside the plan. */
  extras?: Extra[]
  /** Cardio timed outside a workout (a walk, a bike ride). */
  cardio?: CardioEntry[]
  /** "Not going to the gym today" (travelling, sick…). Keeps the streak and pauses the gym reminder. */
  skip?: { reason: string; /** Said yes to training on the weekly day off this week, so the shifted sessions use it. */ useOff?: boolean }
}
export interface CardioEntry { id: string; ex: string; sec: number }
export interface Extra { id: string; label: string; kcal: number; protein: number }

/** Per-record sync bookkeeping: what we last saw, when it changed, and whether the server has it. */
export interface SyncMeta { key: string; kind: string; id: string; hash: string; at: number; dirty: 0 | 1; deleted: boolean }

class V2DB extends Dexie {
  sessions!: Table<SessionLog, string>
  weights!: Table<WeightRow, string>
  measures!: Table<MeasureRow, string>
  photos!: Table<PhotoRow, string>
  days!: Table<DayRow, string>
  syncmeta!: Table<SyncMeta, string>
  constructor() {
    super('v2fit')
    this.version(1).stores({ sessions: 'id, person, date', weights: 'id, person, date', measures: 'id, person, date', photos: 'id, person, date', days: 'id, person, date' })
    // v2: compound indexes for per-person date ranges + backfill updatedAt for merge-mode imports
    this.version(2).stores({ sessions: 'id, person, date, [person+date]', weights: 'id, person, date, [person+date]', days: 'id, person, date, [person+date]' })
      .upgrade(async (tx) => {
        for (const t of ['sessions', 'weights', 'measures', 'days']) await tx.table(t).toCollection().modify((r: { updatedAt?: number }) => { if (!r.updatedAt) r.updatedAt = Date.now() })
      })
    this.version(3).stores({ syncmeta: 'key, dirty' })
  }
}
export const db = new V2DB()

export function useLive<T>(q: () => Promise<T> | T, deps: unknown[], init: T): T {
  const [v, setV] = useState<T>(init)
  useEffect(() => {
    const sub = liveQuery(q).subscribe({ next: (x) => setV(x as T), error: (e) => console.error(e) })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return v
}

export const dayId = (person: Person, date: string) => `${person}|${date}`
export async function patchDay(person: Person, date: string, fn: (d: DayRow) => void) {
  const id = dayId(person, date)
  const cur = (await db.days.get(id)) ?? { id, person, date, eaten: {}, swaps: {}, water: 0, steps: 0, updatedAt: 0 }
  fn(cur); cur.updatedAt = Date.now()
  await db.days.put(cur)
}
export const setWeight = (person: Person, date: string, kg: number) => db.weights.put({ id: dayId(person, date), person, date, kg, updatedAt: Date.now() })
export const personSessions = (person: Person) => db.sessions.where('person').equals(person).sortBy('date')
