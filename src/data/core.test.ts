import { describe, expect, it } from 'vitest'
import { coreBlocks, cardioTarget, coreOn } from './core'
import { resolveCore } from '../engine/program'
import { EX } from './exercises'

describe('daily core session', () => {
  it('has five moves that all exist and train the abs or obliques', () => {
    for (const month of [1, 2, 3]) {
      const r = resolveCore(month * 4)
      expect(r.steps).toHaveLength(5)
      expect(r.def.kind).toBe('core')
      for (const s of r.steps) { expect(EX[s.ex]).toBeTruthy(); expect([...EX[s.ex].muscles.primary, ...EX[s.ex].muscles.secondary].some((m) => m === 'abs' || m === 'obliques')).toBe(true) }
    }
  })
  it('gets harder after month 1', () => {
    const m1 = coreBlocks(1).map((b) => b.type === 'lift' ? b.ex : ''), m2 = coreBlocks(2).map((b) => b.type === 'lift' ? b.ex : '')
    expect(m1).not.toEqual(m2)
  })
  it('defaults: on for Vikas with 30 min cardio, off for Varsha, overridable', () => {
    expect(coreOn('vikas', {})).toBe(true); expect(coreOn('varsha', {})).toBe(false); expect(coreOn('vikas', { dailyCore: false })).toBe(false)
    expect(cardioTarget('vikas', {})).toBe(30); expect(cardioTarget('varsha', {})).toBe(0); expect(cardioTarget('vikas', { cardioDaily: 45 })).toBe(45)
  })
})
