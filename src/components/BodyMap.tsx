import { useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCw } from 'lucide-react'
import type { MuscleId } from '../types'
import { MUSCLE_INFO } from '../data/common'
import { cx } from './ui'

/**
 * Custom SVG anatomy, front and back. Paths are drawn for the figure's left half (viewer's right)
 * on a 200 × 400 canvas and mirrored around x = 100. Region ids match the muscle vocabulary.
 */
export type Region = { id: MuscleId; d: string; center?: boolean }

export const FRONT: Region[] = [
  { id: 'upper-traps', d: 'M107 55 C111 62 119 66 130 69 L112 72 C109 68 107 62 107 55Z' },
  { id: 'front-delts', d: 'M128 70 C135 68 140 71 142 77 C143 86 140 95 134 100 C131 92 129 82 128 70Z' },
  { id: 'side-delts', d: 'M141 71 C149 73 153 83 152 97 C150 101 147 103 144 101 C146 91 146 80 141 71Z' },
  { id: 'upper-chest', d: 'M103 73 L126 71 C129 76 131 82 131 87 C121 84 111 84 103 87Z' },
  { id: 'mid-lower-chest', d: 'M103 89 C111 86 122 86 131 89 C133 99 129 109 121 113 C113 116 107 114 103 111Z' },
  { id: 'biceps', d: 'M135 102 C140 99 146 101 148 106 C151 119 150 134 147 146 C144 149 140 148 138 145 C135 131 134 116 135 102Z' },
  { id: 'brachialis', d: 'M149 117 C153 126 154 138 152 148 L148 147 C150 137 150 127 149 117Z' },
  { id: 'forearms', d: 'M138 151 C144 153 150 152 154 150 C158 168 160 190 159 211 L150 212 C146 195 141 172 138 151Z' },
  { id: 'abs', d: 'M103 117 h12 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-12Z' },
  { id: 'abs', d: 'M103 135 h12 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-12Z' },
  { id: 'abs', d: 'M103 153 h12 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-12Z' },
  { id: 'abs', d: 'M103 171 h11 a3 3 0 0 1 3 3 C117 184 112 192 103 197Z' },
  { id: 'obliques', d: 'M121 117 C126 115 130 111 132 106 C134 124 132 146 127 162 C126 172 127 181 129 189 L120 192 C120 170 120 142 121 117Z' },
  { id: 'hip-flexors', d: 'M112 196 L129 192 C130 200 126 208 119 213 C115 209 112 203 112 196Z' },
  { id: 'adductors', d: 'M103 207 C108 207 113 210 116 216 C116 238 112 260 108 274 C104 258 102 232 103 207Z' },
  { id: 'quads', d: 'M119 216 C125 210 131 202 132 197 C138 215 138 245 134 269 C132 281 128 287 122 289 C115 287 111 280 110 274 C114 258 118 238 119 216Z' },
  { id: 'calves', d: 'M112 301 C118 297 126 299 130 305 C132 323 130 345 125 366 L117 366 C113 345 111 321 112 301Z' },
]

export const BACK: Region[] = [
  { id: 'upper-traps', d: 'M103 54 L107 54 C110 62 119 66 130 69 C122 72 112 75 103 77Z' },
  { id: 'mid-traps-rhomboids', d: 'M103 79 C112 77 120 75 127 73 C125 89 117 106 103 124Z' },
  { id: 'rear-delts', d: 'M128 70 C135 68 140 71 142 77 C143 86 140 95 134 100 C131 92 129 82 128 70Z' },
  { id: 'side-delts', d: 'M141 71 C149 73 153 83 152 97 C150 101 147 103 144 101 C146 91 146 80 141 71Z' },
  { id: 'lats', d: 'M106 126 C116 108 124 97 132 101 C134 117 132 137 127 153 C121 163 113 167 106 169Z' },
  { id: 'lower-back', d: 'M103 128 C104 142 104 158 104 172 C104 180 104 186 103 190Z M105 172 C110 172 116 170 122 164 C122 174 118 184 105 190Z' },
  { id: 'triceps', d: 'M135 102 C141 99 148 102 150 107 C153 121 152 136 149 147 C145 150 140 149 138 145 C135 131 134 116 135 102Z' },
  { id: 'forearms', d: 'M138 151 C144 153 150 152 154 150 C158 168 160 190 159 211 L150 212 C146 195 141 172 138 151Z' },
  { id: 'obliques', d: 'M124 160 C127 166 128 176 130 186 L125 180 C124 174 124 166 124 160Z' },
  { id: 'glute-med', d: 'M112 176 C118 170 126 172 130 180 C131 188 130 192 127 195 C123 188 118 181 112 176Z' },
  { id: 'glutes', d: 'M103 192 C107 184 112 179 117 183 C124 189 130 197 131 206 C130 216 124 222 114 222 C108 222 104 218 103 214Z' },
  { id: 'hamstrings', d: 'M111 226 C119 228 128 224 133 216 C137 236 136 260 132 277 C128 285 120 287 114 283 C110 265 109 246 111 226Z' },
  { id: 'adductors', d: 'M103 218 C106 220 108 224 109 228 C108 246 110 264 112 279 C106 267 103 244 103 218Z' },
  { id: 'calves', d: 'M112 297 C118 291 128 293 132 301 C134 317 131 331 126 341 C120 345 115 343 113 337 C110 323 110 309 112 297Z' },
  { id: 'soleus', d: 'M114 344 C119 348 124 347 127 344 C127 356 125 365 123 373 L117 373 C115 364 114 354 114 344Z' },
]

export const BODY = [
  'M100 56 L108 56 C110 64 120 68 132 69 C145 69 154 80 153 98 C155 118 155 138 153 148 C159 168 161 192 160 214 C162 223 161 233 157 239 C152 241 148 237 148 229 L149 214 C145 196 140 172 137 151 C135 134 133 116 133 104 C134 124 132 146 128 162 C127 174 129 184 132 196 C138 222 138 250 134 272 C132 284 131 292 132 300 C134 318 132 340 127 360 L125 376 C128 384 133 388 135 393 L114 393 C114 386 115 380 115 374 C111 350 109 322 111 300 C111 292 110 284 108 276 C104 256 101 232 100 208Z',
]

export const BACK_ONLY: MuscleId[] = ['mid-traps-rhomboids', 'rear-delts', 'lats', 'lower-back', 'triceps', 'glutes', 'glute-med', 'hamstrings', 'soleus']
export const preferSide = (primary: MuscleId[]): 'front' | 'back' => {
  const b = primary.filter((m) => BACK_ONLY.includes(m)).length
  return primary.length && b >= primary.length / 2 ? 'back' : 'front'
}

interface Props {
  primary?: MuscleId[]
  secondary?: MuscleId[]
  /** 0–1 intensity per muscle (heatmap mode) */
  heat?: Partial<Record<MuscleId, number>>
  selected?: MuscleId | null
  onSelect?: (m: MuscleId) => void
  side?: 'front' | 'back'
  both?: boolean
  height?: number
  info?: boolean
  flip?: boolean
  className?: string
}

function Figure({ side, primary = [], secondary = [], heat, selected, onSelect, height }: Props & { side: 'front' | 'back' }) {
  const regions = side === 'front' ? FRONT : BACK
  const style = (id: MuscleId): { fill: string; opacity: number; cls?: string } => {
    if (selected === id) return { fill: 'var(--a2c)', opacity: 1, cls: 'muscle-primary' }
    if (heat) { const v = heat[id] ?? 0; return v > 0 ? { fill: 'var(--a1c)', opacity: 0.25 + 0.75 * Math.min(1, v) } : { fill: 'rgb(var(--s3))', opacity: 1 } }
    if (primary.includes(id)) return { fill: 'url(#bm-grad)', opacity: 1, cls: 'muscle-primary' }
    if (secondary.includes(id)) return { fill: 'var(--a1c)', opacity: 0.4 }
    return { fill: 'rgb(var(--s3))', opacity: 1 }
  }
  const half = (mirror: boolean) => (
    <g transform={mirror ? 'translate(200 0) scale(-1 1)' : undefined}>
      {BODY.map((d, i) => <path key={i} d={d} fill="rgb(var(--s2))" stroke="rgb(var(--line))" strokeWidth={0.8} />)}
      {regions.map((r, i) => {
        const s = style(r.id)
        const lit = s.cls === 'muscle-primary'
        return (
          <path key={`${r.id}${i}`} d={r.d} fill={s.fill} opacity={s.opacity} className={s.cls} filter={lit ? 'url(#bm-glow)' : undefined}
            stroke="rgb(var(--bg))" strokeWidth={0.7} strokeLinejoin="round"
            onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(r.id) } : undefined}
            style={{ cursor: onSelect ? 'pointer' : undefined, transition: 'fill .4s, opacity .4s' }}>
            <title>{MUSCLE_INFO[r.id].name}</title>
          </path>
        )
      })}
    </g>
  )
  return (
    <svg viewBox="30 4 140 394" height={height} style={{ height, width: 'auto' }} role="img" aria-label={`Body map, ${side}`}>
      <defs>
        <linearGradient id="bm-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--a1c)" /><stop offset="1" stopColor="var(--a2c)" /></linearGradient>
        <filter id="bm-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse cx="100" cy="32" rx="15" ry="19" fill="rgb(var(--s2))" stroke="rgb(var(--line))" strokeWidth={0.8} />
      {half(false)}{half(true)}
      {side === 'back' && <path d="M100 58 L100 190" stroke="rgb(var(--bg))" strokeWidth={1.2} opacity={0.7} />}
      {side === 'front' && <path d="M100 74 L100 198" stroke="rgb(var(--bg))" strokeWidth={1} opacity={0.5} />}
    </svg>
  )
}

export function BodyMap(p: Props) {
  const [side, setSide] = useState<'front' | 'back'>(p.side ?? preferSide(p.primary ?? []))
  const [tip, setTip] = useState<MuscleId | null>(null)
  const h = p.height ?? 260
  const pick = (m: MuscleId) => { setTip(m); p.onSelect?.(m) }
  const interactive = p.info || !!p.onSelect
  if (p.both) {
    return (
      <div className={cx('relative flex items-center justify-center gap-2', p.info && tip && 'pb-16', p.className)}>
        <Figure {...p} side="front" height={h} onSelect={interactive ? pick : undefined} />
        <Figure {...p} side="back" height={h} onSelect={interactive ? pick : undefined} />
        {p.info && tip && <Tip id={tip} />}
      </div>
    )
  }
  return (
    <div className={cx('relative flex flex-col items-center', p.className)}>
      <motion.div key={side} initial={{ rotateY: 70, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.35 }} style={{ perspective: 600 }}>
        <Figure {...p} side={side} height={h} onSelect={interactive ? pick : undefined} />
      </motion.div>
      {p.flip !== false && (
        <button type="button" onClick={() => setSide(side === 'front' ? 'back' : 'front')} aria-label={`Show ${side === 'front' ? 'back' : 'front'} of body`}
          className="absolute right-0 top-0 min-h-[44px] px-3 rounded-full bg-s2 border border-line/70 text-[12px] font-medium inline-flex items-center gap-1.5">
          <RotateCw size={14} /> {side === 'front' ? 'Front' : 'Back'}
        </button>
      )}
      {p.info && tip && <Tip id={tip} />}
    </div>
  )
}

const Tip = ({ id }: { id: MuscleId }) => (
  <motion.div key={id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[92%] rounded-2xl glass border border-line px-3 py-2 text-center" role="status">
    <div className="text-[13px] font-semibold accent-text">{MUSCLE_INFO[id].name}</div>
    <div className="text-[12px] text-mute">{MUSCLE_INFO[id].does}</div>
  </motion.div>
)
