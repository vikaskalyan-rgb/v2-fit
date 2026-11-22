import { BACK, BODY, FRONT } from '../components/BodyMap'
import type { MuscleId } from '../types'

/** Print version of the anatomy figure: fixed light colours, heat ramp, rendered to a PNG data URL for the PDF. */
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('') }
export const RAMP = ['#cfe0ff', '#5b94f5', '#1d4ed8', '#0b2a7a']
/** 0 → none, 1 → strongest. */
export function heatColor(v: number): string {
  if (v <= 0) return '#e4e8f2'
  const t = Math.min(1, 0.12 + 0.88 * v) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(t))
  return mix(RAMP[i], RAMP[i + 1], t - i)
}

export function bodySvg(side: 'front' | 'back', heat: Partial<Record<MuscleId, number>>): string {
  const regions = side === 'front' ? FRONT : BACK
  const half = (mirror: boolean) => {
    const g = BODY.map((d) => `<path d="${d}" fill="#f2f4fa" stroke="#aab3cb" stroke-width="0.9"/>`).join('') +
      regions.map((r) => `<path d="${r.d}" fill="${heatColor(heat[r.id] ?? 0)}" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round"/>`).join('')
    return `<g${mirror ? ' transform="translate(200 0) scale(-1 1)"' : ''}>${g}</g>`
  }
  const seam = side === 'back' ? '<path d="M100 58 L100 190" stroke="#ffffff" stroke-width="1.2" opacity=".7"/>' : '<path d="M100 74 L100 198" stroke="#ffffff" stroke-width="1" opacity=".6"/>'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 4 140 394" width="280" height="788"><ellipse cx="100" cy="32" rx="15" ry="19" fill="#f2f4fa" stroke="#aab3cb" stroke-width="0.9"/>${half(false)}${half(true)}${seam}</svg>`
}

const cache = new Map<string, string>()
/** Aspect ratio of the figure (width / height). */
export const BODY_ASPECT = 140 / 394

export async function bodyPng(side: 'front' | 'back', heat: Partial<Record<MuscleId, number>>): Promise<string> {
  const key = side + JSON.stringify(Object.entries(heat).sort())
  const hit = cache.get(key)
  if (hit) return hit
  const svg = bodySvg(side, heat)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('body image failed')); img.src = url })
    const c = document.createElement('canvas'); c.width = 420; c.height = Math.round(420 / BODY_ASPECT)
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const out = c.toDataURL('image/png')
    cache.set(key, out)
    return out
  } finally { URL.revokeObjectURL(url) }
}
