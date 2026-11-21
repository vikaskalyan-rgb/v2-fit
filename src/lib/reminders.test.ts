import { describe, expect, it } from 'vitest'
import { buildItems } from './reminders'
import type { Profile } from '../types'

const prof = { heightCm: 175, weightKg: 70, age: 28, sex: 'male', gymTime: '07:00', veg: false, kcalAdjust: 0, onboarded: true } as Profile
const st = { programStart: '2026-11-15', mergeDay0: false }

describe('reminders and skipped days', () => {
  it('drops the gym nudge on a day marked not going, keeps meals', () => {
    const all = buildItems('vikas', '2026-11-16', st, prof)
    const gymDate = all.find((i) => i.title === 'Gym in 15 minutes')!.date
    const cut = buildItems('vikas', '2026-11-16', st, prof, {}, new Set([gymDate]))
    expect(cut.some((i) => i.date === gymDate && i.title === 'Gym in 15 minutes')).toBe(false)
    expect(cut.some((i) => i.date === gymDate && !!i.slot)).toBe(true)
    // the skipped session isn't lost: it reappears on the next day instead
    const nextDay = cut.find((i) => i.title === 'Gym in 15 minutes' && i.date === '2026-11-17')
    expect(nextDay?.body).toBe(all.find((i) => i.title === 'Gym in 15 minutes' && i.date === gymDate)!.body)
  })
  it('a weekly day off has no gym nudge and Saturday carries the moved session', () => {
    const all = buildItems('vikas', '2026-11-16', st, prof)
    expect(all.some((i) => i.title === 'Gym in 15 minutes' && i.date === '2026-11-20')).toBe(false)
    expect(all.find((i) => i.title === 'Gym in 15 minutes' && i.date === '2026-11-21')?.body).toMatch(/Lower B/)
  })
})

describe('reminders', () => {
  it('builds a week of meals, gym nudges and water prompts, sorted', () => {
    const items = buildItems('vikas', '2026-11-16', st, prof)
    expect(new Set(items.map((i) => i.date)).size).toBe(7)
    expect(items.length).toBeLessThan(200)                // the server rejects more than 200 a week
    expect(buildItems('varsha', '2026-11-16', st, prof).length).toBeLessThan(200)
    expect(items.filter((i) => i.title === 'Drink some water').length).toBe(84)
    const q = items.filter((i) => i.title.startsWith('Gym o'))
    expect(q.length).toBe(7)
    expect(q.every((i) => i.at === 15 * 60 && i.body.length > 10)).toBe(true)
    expect(new Set(q.map((i) => i.body)).size).toBe(7)
    expect(items.filter((i) => i.slot).every((i) => i.img)).toBe(true)
    expect(items.some((i) => i.slot === 'breakfast')).toBe(true)
    expect(items.some((i) => i.title === 'Gym in 15 minutes' && i.at === 6 * 60 + 45)).toBe(true)
    const keys = items.map((i) => `${i.date}${String(i.at).padStart(4, '0')}`)
    expect(keys).toEqual([...keys].sort())
    expect(items.every((i) => i.title && i.at >= 0 && i.at < 1440)).toBe(true)
  })
  it('sends nothing before the program starts', () => {
    expect(buildItems('vikas', '2026-11-01', st, prof).filter((i) => i.date < '2026-11-15')).toEqual([])
  })
})
