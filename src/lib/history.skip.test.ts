import { describe, expect, it } from 'vitest'
import { streak } from './history'
import type { SessionLog } from '../types'

const s = (date: string) => ({ id: date, date, finishedAt: 1 }) as unknown as SessionLog
describe('streak with skipped days', () => {
  // Mon 16, Tue 17 done; Wed 18 missed; Thu 19 done; today Fri 20
  const sessions = [s('2026-11-16'), s('2026-11-17'), s('2026-11-19')]
  it('breaks at an unmarked miss', () => expect(streak(sessions, '2026-11-20', '2026-11-16')).toBe(1))
  it('does not break at a day marked not going, and does not count it', () => expect(streak(sessions, '2026-11-20', '2026-11-16', new Set(['2026-11-18']))).toBe(3))
})

describe('streak with a weekly day off', () => {
  it('a day off does not break the streak', async () => {
    const { streak } = await import('./history')
    const { gymDayFn } = await import('../engine/schedule')
    const mk = (date: string) => ({ date, finishedAt: 1 }) as never
    // Mon 16 .. Thu 19 done, Fri 20 is the day off, Sat 21 Lower B done
    const sessions = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-21'].map(mk)
    expect(streak(sessions, '2026-11-21', '2026-11-16', new Set(), gymDayFn('vikas', 'fri', {}))).toBe(5)
    expect(streak(sessions, '2026-11-21', '2026-11-16', new Set())).toBe(1)   // the old Mon-Fri rule would have broken at Friday
  })
})
