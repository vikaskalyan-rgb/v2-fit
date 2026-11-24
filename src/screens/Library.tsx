import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronRight, Search, SearchX, X } from 'lucide-react'
import { useStore, usePerson } from '../store'
import type { MuscleId } from '../types'
import { EX, EXERCISES, exName } from '../data/exercises'
import { MUSCLE_INFO, SAFETY } from '../data/common'
import { BodyMap } from '../components/BodyMap'
import { CardioTimer } from '../components/CardioTimer'
import { ExerciseMedia, ExerciseThumb } from '../components/Media'
import { Card, Chip, Empty, cx, item, stagger } from '../components/ui'
import { useSessions } from '../lib/hooks'
import { pastByExercise } from '../lib/history'
import { lastLine } from '../engine/progression'

const EQUIP = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Cardio'] as const
const equipOf = (e: (typeof EXERCISES)[number]) => {
  const t = e.equipment.join(' ').toLowerCase()
  if (e.loadType === 'cardio') return 'Cardio'
  if (e.loadType === 'bw' || e.loadType === 'hold') return 'Bodyweight'
  if (t.includes('cable')) return 'Cable'
  if (t.includes('dumbbell') || t.includes('kettlebell')) return 'Dumbbell'
  if (t.includes('barbell') || t.includes('ez bar') || t.includes('trap bar') || t.includes('t-bar')) return 'Barbell'
  return 'Machine'
}

export function Library() {
  const open = useStore((s) => s.open)
  const person = usePerson()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleId | null>(null)
  const [equip, setEquip] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(true)
  const list = useMemo(() => EXERCISES.filter((e) =>
    (!q || e.name.toLowerCase().includes(q.toLowerCase())) &&
    (!muscle || e.muscles.primary.includes(muscle) || e.muscles.secondary.includes(muscle)) &&
    (!equip || equipOf(e) === equip)).sort((a, b) => (muscle ? Number(b.muscles.primary.includes(muscle)) - Number(a.muscles.primary.includes(muscle)) : 0) || a.name.localeCompare(b.name)), [q, muscle, equip])
  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.h1 variants={item} className="display text-[30px] font-semibold">Library</motion.h1>
      <motion.label variants={item} className="mt-3 flex items-center gap-2 rounded-2xl bg-s1 border border-line/60 px-4 min-h-[52px]">
        <Search size={18} className="text-mute" /><input aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" className="flex-1 bg-transparent outline-none" />
        {q && <button type="button" aria-label="Clear search" onClick={() => setQ('')} className="w-9 h-9 grid place-items-center"><X size={16} /></button>}
      </motion.label>
      <motion.div variants={item} className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
        {EQUIP.map((e) => <Chip key={e} tone={equip === e ? 'accent' : 'default'} onClick={() => setEquip(equip === e ? null : e)}>{e}</Chip>)}
      </motion.div>
      <motion.div variants={item}><Card className="mt-3 !p-3">
        <button type="button" className="w-full flex items-center justify-between min-h-[44px] text-[14px] font-medium" aria-expanded={showMap} onClick={() => setShowMap(!showMap)}>
          <span>{muscle ? <>Filter: <span className="accent-text">{MUSCLE_INFO[muscle].name}</span></> : 'Tap a muscle to filter'}</span>
          {muscle ? <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setMuscle(null) }} className="text-[13px] text-mute underline px-2 py-2">Clear</span> : <span className="text-[13px] text-mute">{showMap ? 'Hide' : 'Show'}</span>}
        </button>
        {showMap && <BodyMap both height={210} selected={muscle} onSelect={(m) => setMuscle(muscle === m ? null : m)} />}
      </Card></motion.div>
      <div className="mt-3 space-y-2">
        {list.length === 0 && <Empty icon={<SearchX />} title="No exercises match" body="Try clearing a filter or searching for something shorter." />}
        {list.map((e) => (
          <button key={e.id} type="button" onClick={() => open({ type: 'exercise', id: e.id })} className="w-full card !rounded-2xl p-2.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform">
            <div className="w-16 h-12 rounded-xl overflow-hidden bg-s2 shrink-0 grid place-items-center">
              <ExerciseThumb ex={e} person={person} />
            </div>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{e.name}</div><div className="text-[12px] text-mute truncate">{e.muscles.primary.map((m) => MUSCLE_INFO[m].name).join(', ') || 'Cardio'} · {equipOf(e)}</div></div>
            <ChevronRight size={16} className="text-mute" />
          </button>))}
      </div>
    </motion.div>
  )
}

export function ExerciseDetail({ id }: { id: string }) {
  const person = usePerson()
  const open = useStore((s) => s.open)
  const sessions = useSessions(undefined, true)
  const e = EX[id]
  const past = useMemo(() => pastByExercise(sessions ?? [])[id]?.[0], [sessions, id])
  if (!e) return null
  return (
    <motion.div className="fixed inset-0 z-50 bg-bg flex flex-col h-dvh-full" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
      <div className="max-w-[520px] w-full mx-auto flex flex-col h-full">
        <div className="safe-t shrink-0 flex items-center gap-2 px-3 py-2">
          <button type="button" aria-label="Back" onClick={() => open(null)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><ArrowLeft size={20} /></button>
          <div className="display font-semibold text-[17px] truncate">{e.name}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-10 no-scrollbar">
          <ExerciseMedia ex={e} person={person} />
          <h1 className="display text-[26px] font-semibold mt-3 leading-tight">{e.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">{e.equipment.map((x) => <Chip key={x}>{x}</Chip>)}{e.tempo !== '—' && e.tempo !== 'hold' && <Chip>Tempo {e.tempo}</Chip>}</div>
          {past && <div className="mt-2 text-[13px] text-mute num">{lastLine(past, e.loadType === 'hold')}</div>}
          {e.loadType === 'cardio' && <CardioTimer ex={e.id} />}
          <Card className="mt-3 !p-3">
            {e.loadType === 'cardio'
              ? <div className="text-[14px]"><div className="font-semibold mb-1">Heart-rate zone guide</div><p className="text-mute">Zone 2 is an easy pace where you can talk in short sentences. Intervals: hard means you can’t chat; easy means you recover fully.</p></div>
              : <><BodyMap both primary={e.muscles.primary} secondary={e.muscles.secondary} height={230} info />
                <div className="flex flex-wrap gap-1.5 justify-center mt-2">{e.muscles.primary.map((m) => <Chip key={m} tone="accent">{MUSCLE_INFO[m].name}</Chip>)}{e.muscles.secondary.map((m) => <Chip key={m}>{MUSCLE_INFO[m].name}</Chip>)}</div></>}
          </Card>
          {([['How to', e.howTo, true], ['Cues', e.cues, false], ['Common mistakes', e.mistakes, false]] as const).map(([t, l, num]) => (
            <div key={t} className="mt-4"><h2 className="display font-semibold text-[17px] mb-1.5">{t}</h2>
              {num ? <ol className="space-y-1.5 text-[15px] list-decimal list-inside marker:text-mute">{l.map((x) => <li key={x}>{x}</li>)}</ol> : <ul className="space-y-1.5 text-[15px]">{l.map((x) => <li key={x} className="flex gap-2"><span className="accent-text">•</span>{x}</li>)}</ul>}</div>))}
          <div className="mt-4 grid gap-2">
            {[['Breathing', e.breathing], ['Starting weight', e.startingTip], ['Safety', e.safety]].map(([t, v]) => <div key={t} className="rounded-2xl bg-s1 border border-line/60 px-4 py-3"><div className="text-[12px] uppercase tracking-widest text-mute font-semibold">{t}</div><div className="text-[15px] mt-0.5">{v}</div></div>)}
          </div>
          {e.alternatives.length > 0 && <div className="mt-4"><h2 className="display font-semibold text-[17px] mb-1.5">Alternatives</h2>
            <div className="space-y-2">{e.alternatives.map((a) => <button key={a} type="button" onClick={() => open({ type: 'exercise', id: a })} className={cx('w-full min-h-[52px] px-4 rounded-2xl bg-s2 border border-line/60 flex items-center justify-between text-left')}><span>{exName(a)}</span><ChevronRight size={16} className="text-mute" /></button>)}</div></div>}
          <p className="text-[12px] text-mute mt-4">{SAFETY}</p>
        </div>
      </div>
    </motion.div>
  )
}
