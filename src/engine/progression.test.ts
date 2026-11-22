import { describe, expect, it } from 'vitest'

describe('per-side loading', () => {
  it('leg press is entered per side like dumbbells', async () => {
    const { isEach, suggest } = await import('./progression')
    expect(isEach('machine', 'leg-press')).toBe(true)
    expect(isEach('bb-lower', 'leg-press')).toBe(true)
    expect(isEach('machine', 'leg-extension')).toBe(false)
    const s = suggest([{ date: '2026-11-15', w: 30, reps: [10, 10] }] as never, { ex: 'leg-press', sets: 2, reps: [8, 10] }, 'bb-lower')
    expect(s.text).toContain('kg each')
    expect(suggest([{ date: '2026-11-15', w: 30, reps: [8, 8] }] as never, { ex: 'leg-extension', sets: 2, reps: [8, 10] }, 'machine').text).not.toContain('each')
  })
})
