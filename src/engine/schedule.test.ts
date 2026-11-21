import { describe, expect, it } from 'vitest'
import { defaultLayout, describeMoves, offDayOf, previewSkip, weekPlan, weekStartOf } from './schedule'

const MON = '2026-11-16'   // a Monday
const sess = (p: ReturnType<typeof weekPlan>) => p.slots.map((s) => (s.off ? 'OFF' : s.session))

describe('weekly day off', () => {
  it('defaults: Vikas Friday off, Varsha none, explicit values win', () => {
    expect(offDayOf('vikas')).toBe('fri')
    expect(offDayOf('varsha')).toBeNull()
    expect(offDayOf('vikas', { offDay: 'none' })).toBeNull()
    expect(offDayOf('varsha', { offDay: 'wed' })).toBe('wed')
  })
  it('Friday off: Lower B to Saturday, Active to Sunday', () => {
    expect(sess(weekPlan('vikas', MON, 'fri'))).toEqual(['mon', 'tue', 'wed', 'thu', 'OFF', 'fri', 'sat'])
  })
  it('no day off keeps the original week', () => {
    expect(defaultLayout('vikas', null).map((l) => l.session)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
  })
  it('weekStartOf finds the Monday', () => { expect(weekStartOf('2026-11-22')).toBe(MON); expect(weekStartOf(MON)).toBe(MON) })
})

describe('skipping a day', () => {
  it('Monday skipped, Friday = yes: everything moves one day, Friday is used', () => {
    const p = weekPlan('vikas', MON, 'fri', { [MON]: { useOff: true } })
    expect(sess(p)).toEqual(['mon', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
    expect(p.slots[0].skipped).toBe(true)
    expect(p.slots[4].usedOff).toBe(true)
    expect(p.dropped).toEqual([])
  })
  it('Monday skipped, Friday = no: Friday stays off, Active recovery is dropped', () => {
    const p = weekPlan('vikas', MON, 'fri', { [MON]: { useOff: false } })
    expect(sess(p)).toEqual(['mon', 'mon', 'tue', 'wed', 'OFF', 'thu', 'fri'])
    expect(p.dropped).toEqual(['sat'])
  })
  it('Wednesday skipped, no: Push Thu, Pull Sat, Lower B Sun', () => {
    expect(sess(weekPlan('vikas', MON, 'fri', { '2026-11-18': { useOff: false } }))).toEqual(['mon', 'tue', 'wed', 'wed', 'OFF', 'thu', 'fri'])
  })
  it('Saturday skipped (after the off day): Lower B moves to Sunday, Active dropped', () => {
    const p = weekPlan('vikas', MON, 'fri', { '2026-11-21': {} })
    expect(sess(p)).toEqual(['mon', 'tue', 'wed', 'thu', 'OFF', 'fri', 'fri'])
    expect(p.dropped).toEqual(['sat'])
  })
  it('two skips in one week apply in order', () => {
    const p = weekPlan('vikas', MON, 'fri', { [MON]: { useOff: true }, '2026-11-17': { useOff: true } })
    expect(sess(p)).toEqual(['mon', 'mon', 'mon', 'tue', 'wed', 'thu', 'fri'])
    expect(p.dropped).toEqual(['sat'])
    expect(p.slots.map((x) => x.skipped)).toEqual([true, true, false, false, false, false, false])
  })
  it('skipping a rest or off day changes nothing else', () => {
    expect(sess(weekPlan('vikas', MON, 'fri', { '2026-11-20': {} }))).toEqual(['mon', 'tue', 'wed', 'thu', 'OFF', 'fri', 'sat'])
  })
  it('without a day off Sunday rest absorbs the shift', () => {
    expect(sess(weekPlan('vikas', MON, null, { [MON]: {} }))).toEqual(['mon', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
  })
  it('works for Varsha too (own sessions)', () => {
    const p = weekPlan('varsha', MON, 'fri', { [MON]: { useOff: true } })
    expect(p.slots[1].session).toBe('mon')
    expect(p.slots[5].session).toBe('fri')
  })
})

describe('previewSkip', () => {
  it('asks about the day off only when it lies after the skipped day', () => {
    expect(previewSkip('vikas', MON, 'fri', {}).asksOff).toBe(true)
    expect(previewSkip('vikas', '2026-11-21', 'fri', {}).asksOff).toBe(false)
    expect(previewSkip('vikas', '2026-11-20', 'fri', {}).workout).toBe(false)
    expect(previewSkip('vikas', MON, null, {}).asksOff).toBe(false)
  })
  it('describes the moves', () => {
    const d = describeMoves('vikas', previewSkip('vikas', MON, 'fri', {}).no, MON)
    expect(d).toContain('Tue Upper A')
    expect(d).toContain('dropped this week')
  })
})
