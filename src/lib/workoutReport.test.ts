import { describe, expect, it } from 'vitest'
import { balanceNotes, buildReport } from './workoutReport'
import type { SessionLog } from '../types'

const S = (date: string, sets: SessionLog['sets'], exOf: SessionLog['exOf'], extra: Partial<SessionLog> = {}): SessionLog => ({
  id: 'vikas|' + date, person: 'vikas', date, key: 'mon', title: 'Upper A', cycle: 1, weekIndex: 1, startedAt: 1, finishedAt: 3600_001, sets, exOf, updatedAt: 1, ...extra })
const base = { person: 'vikas' as const, days: [], from: '2026-11-09', to: '2026-11-22', kgOn: () => 70, planned: 10 }

describe('workout report', () => {
  const sessions = [
    S('2026-11-16', { a: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }, { w: 60, r: 6, done: false }], b: [{ w: 35, r: 10, done: true }] }, { a: 'bb-bench-press', b: 'leg-press' }, { prs: ['bb-bench-press'] }),
    S('2026-11-18', { a: [{ w: 62.5, r: 8, done: true }] }, { a: 'bb-bench-press' }),
    S('2026-11-30', { a: [{ w: 1, r: 1, done: true }] }, { a: 'bb-bench-press' }),   // outside the window
  ]
  const r = buildReport({ ...base, sessions })
  it('counts only finished sets inside the window', () => {
    expect(r.totals.workouts).toBe(2)
    expect(r.totals.sets).toBe(4)
    expect(r.sessions[0].sets).toBe(3)
  })
  it('volume: leg press counts both sides, unfinished sets are ignored', () => {
    expect(r.sessions[0].volume).toBe(60 * 8 * 2 + 35 * 10 * 2)
    expect(r.totals.volume).toBe(960 + 700 + 500)
  })
  it('muscles get direct and indirect sets', () => {
    const chest = r.muscles.find((m) => m.id === 'mid-lower-chest')!
    expect(chest.direct).toBe(3)
    const tri = r.muscles.find((m) => m.id === 'triceps')!
    expect(tri.direct + tri.indirect).toBeGreaterThan(0)
    expect(r.heat['mid-lower-chest']).toBeGreaterThan(0.5)
    expect(Math.max(...Object.values(r.heat) as number[])).toBe(1)
  })
  it('energy, time and PRs', () => {
    expect(r.sessions[0].minutes).toBe(60)
    expect(r.sessions[0].kcal).toBe(Math.round(4 * 70))
    expect(r.totals.prs).toBe(1)
    expect(r.totals.avgMinutes).toBe(60)
  })
  it('weekly buckets, calendar and best lifts', () => {
    expect(r.weeks).toHaveLength(2)
    expect(r.calendar).toHaveLength(14)
    expect(r.calendar.find((c) => c.date === '2026-11-16')!.sessions).toEqual(['Upper A'])
    expect(r.lifts[0].name).toBeTruthy()
    expect(r.lifts.find((l) => l.ex === 'bb-bench-press')!.best).toContain('62.5')
  })
  it('balance notes read sensibly and handle empty periods', () => {
    expect(balanceNotes(r).length).toBeGreaterThan(0)
    const empty = buildReport({ ...base, sessions: [] })
    expect(empty.totals.workouts).toBe(0)
    expect(balanceNotes(empty)[0]).toMatch(/No completed/)
  })
})
