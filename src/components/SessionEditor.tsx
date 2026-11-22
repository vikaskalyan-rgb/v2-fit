import { isEach } from '../engine/progression'
import { useEffect, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { db, useLive } from '../db'
import { EX, exName } from '../data/exercises'
import { fmtDate } from '../engine/calendar'
import type { SessionLog, SetLog } from '../types'
import { Btn, Sheet, Stepper, cx } from './ui'

const loadless = (t?: string) => t === 'bw' || t === 'hold' || t === 'cardio'
const wStep = (t?: string) => (t === 'db' ? 1 : t === 'machine' || t === 'assist' ? 5 : 2.5)
/** Same rule the session uses for its volume figure, so an edit changes it by exactly the difference. */
const volumeOf = (log: Pick<SessionLog, 'sets' | 'exOf'>) => Object.entries(log.sets).reduce((v, [id, rows]) => {
  const t = EX[log.exOf[id]]?.loadType
  if (!t || loadless(t) || t === 'assist') return v
  return v + rows.filter((r) => r.done).reduce((x, r) => x + r.w * r.r * (isEach(t, log.exOf[id]) ? 2 : 1), 0)
}, 0)

/** Fix the numbers of a finished workout: weights (decimals allowed), reps, done ticks and cardio minutes. */
export function SessionEditor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const log = useLive<SessionLog | undefined>(() => (id ? db.sessions.get(id) : Promise.resolve(undefined)), [id], undefined)
  const [sets, setSets] = useState<Record<string, SetLog[]>>({})
  const [cardio, setCardio] = useState<Record<string, number>>({})
  useEffect(() => { if (log) { setSets(structuredClone(log.sets)); setCardio({ ...(log.cardio ?? {}) }) } }, [log?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (sid: string, i: number, patch: Partial<SetLog>) => setSets((s) => ({ ...s, [sid]: s[sid].map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  const save = async () => {
    if (!log) return
    const volume = Math.max(0, Math.round((log.volume ?? 0) + volumeOf({ sets, exOf: log.exOf }) - volumeOf(log)))
    const keep = Object.fromEntries(Object.entries(cardio).filter(([, v]) => v > 0))
    await db.sessions.put({ ...log, sets, cardio: Object.keys(keep).length ? keep : undefined, volume, updatedAt: Date.now() })
    onClose()
  }
  const ids = log ? Object.keys(log.exOf) : []
  return (
    <Sheet open={!!id} onClose={onClose} title={log ? `${log.title} · ${fmtDate(log.date)}` : 'Workout'} full>
      {!log ? <p className="text-mute">Loading…</p> : (
        <div data-testid="session-editor">
          <p className="text-[13px] text-mute mb-3">Change anything you logged. Tap a number to type it, decimals are fine.</p>
          {ids.map((sid) => {
            const ex = EX[log.exOf[sid]]
            const rows = sets[sid]
            if (!ex) return null
            if (ex.loadType === 'cardio') return cardio[sid] === undefined && !log.cardio?.[sid] ? null : (
              <div key={sid} className="mb-4">
                <div className="font-semibold mb-1.5">{exName(ex.id)}</div>
                <Stepper value={Math.round((cardio[sid] ?? 0) / 6) / 10} onChange={(m) => setCardio((c) => ({ ...c, [sid]: Math.round(m * 60) }))} step={1} unit="minutes" label={`${ex.name} minutes`} />
              </div>)
            if (!rows?.length) return null
            const hold = ex.loadType === 'hold'
            return (
              <div key={sid} className="mb-4">
                <div className="font-semibold mb-1.5">{exName(ex.id)}</div>
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className={cx('flex items-center gap-1 rounded-2xl bg-s2 border border-line/60 px-2 py-1.5', !r.done && 'opacity-60')}>
                      <span className="w-5 text-[13px] text-mute text-center">{i + 1}</span>
                      {!loadless(ex.loadType) && <Stepper value={r.w} onChange={(v) => edit(sid, i, { w: v })} step={wStep(ex.loadType)} unit={isEach(ex.loadType, ex.id) ? 'kg each' : 'kg'} label={`${ex.name} set ${i + 1} weight`} tight />}
                      <Stepper value={r.r} onChange={(v) => edit(sid, i, { r: v })} step={hold ? 5 : 1} unit={hold ? 'sec' : 'reps'} label={`${ex.name} set ${i + 1} ${hold ? 'seconds' : 'reps'}`} tight />
                      <button type="button" aria-label={`Set ${i + 1} ${r.done ? 'done' : 'not done'}`} aria-pressed={r.done} onClick={() => edit(sid, i, { done: !r.done })}
                        className={cx('ml-auto w-10 h-12 rounded-xl grid place-items-center border', r.done ? 'accent-grad text-black border-transparent' : 'bg-s1 border-line/70 text-mute')}><Check size={18} /></button>
                    </div>))}
                </div>
                <button type="button" onClick={() => setSets((s) => ({ ...s, [sid]: [...s[sid], { ...s[sid][s[sid].length - 1], done: true }] }))} className="mt-2 text-[13px] text-mute inline-flex items-center gap-1.5 min-h-[40px]"><Plus size={14} /> Add a set</button>
              </div>)
          })}
          <Btn className="w-full mt-2" onClick={() => void save()}>Save changes</Btn>
        </div>)}
    </Sheet>
  )
}
