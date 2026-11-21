import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Flame, Info, Pause, Pencil, Play, Plus, Repeat, Share2, SkipForward, Star, Timer, Trash2, Trophy, X } from 'lucide-react'
import type { MuscleId, SessionLog, Step } from '../types'
import { NAME } from '../types'
import { useStore, usePerson, type Active } from '../store'
import { db, setWeight } from '../db'
import { EX, exName } from '../data/exercises'
import { COOLDOWN, COOLDOWN_HOLD, DAY0, FIRST_TIME, RIR_EXPLAIN, ROUTINE_ID, SAFETY, WARMUP, WEEK1_BANNER } from '../data/common'
import { resolveActive } from '../lib/session'
import { restText, rxText, sessionMuscles } from '../engine/program'
import { isPR, lastLine, rampSets, suggest, type Past, type Suggestion } from '../engine/progression'
import { allSets, pastByExercise } from '../lib/history'
import { useSessions, useTick } from '../lib/hooks'
import { chime, keepAwake } from '../lib/audio'
import { shareCard } from '../lib/share'
import { fmtDate } from '../engine/calendar'
import { BodyMap } from '../components/BodyMap'
import { ExerciseMedia } from '../components/Media'
import { fmtDuration } from '../lib/cardio'
import { RoutineSheet } from '../components/RoutineSheet'
import { RoutineImage } from '../components/RoutineImage'
import { Btn, Chip, Confetti, Sheet, Stepper, cx, spring } from '../components/ui'

export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`
const isLoadless = (t: string) => t === 'bw' || t === 'hold' || t === 'cardio'

export function SessionScreen() {
  const person = usePerson()
  const active = useStore((s) => s.active[person])
  const profile = useStore((s) => s.profiles[person])
  const open = useStore((s) => s.open)
  const sessions = useSessions()

  useEffect(() => {
    void keepAwake(true)
    const vis = () => { if (document.visibilityState === 'visible') void keepAwake(true) }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); void keepAwake(false) }
  }, [])

  const res = useMemo(() => (active ? resolveActive(person, active, profile) : null), [person, active?.isDay0, active?.weekIndex, active?.weekday, JSON.stringify(active?.swaps), profile.squatApproved]) // eslint-disable-line
  const prior = useMemo(() => (sessions ?? []).filter((s) => s.id !== active?.id), [sessions, active?.id])
  const past = useMemo(() => pastByExercise(prior), [prior])

  if (!active || !res) return null
  return (
    <motion.div className="fixed inset-0 z-50 bg-bg flex flex-col h-dvh-full" initial={{ opacity: 0, scale: 0.96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
      <div className="aura" />
      <div className="relative z-10 flex flex-col h-full max-w-[520px] w-full mx-auto">
        {active.phase === 'intro' && <Intro a={active} />}
        {active.phase === 'warmup' && <Warmup a={active} steps={res.steps} kind={res.def.kind} past={past} />}
        {active.phase === 'work' && <Work a={active} kind={res.def.kind} steps={res.steps} rir={res.mod.rir} modName={res.mod.name} past={past} prior={prior} loading={sessions === undefined} />}
        {active.phase === 'cooldown' && <Cooldown />}
        {active.phase === 'finish' && <Finish a={active} steps={res.steps} onDone={() => open(null)} />}
      </div>
      <RestOverlay steps={res.steps} />
    </motion.div>
  )
}

function Top({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  const open = useStore((s) => s.open)
  return (
    <div className="safe-t shrink-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" aria-label="Minimise session" onClick={() => open(null)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><ChevronDown size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="display font-semibold text-[17px] truncate">{title}</div>
          {sub && <div className="text-[12px] text-mute truncate">{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  )
}

// ── Countdown (timestamp based, so it survives lock / app switch) ────────────
export function useCountdown(total: number, sounds: boolean, onDone?: () => void) {
  const [st, setSt] = useState<{ startedAt: number | null; elapsed: number }>({ startedAt: null, elapsed: 0 })
  useTick(250, st.startedAt !== null)
  const el = st.elapsed + (st.startedAt ? (Date.now() - st.startedAt) / 1000 : 0)
  const left = Math.max(0, total - el)
  const fired = useRef(false)
  useEffect(() => { if (left <= 0 && st.startedAt && !fired.current) { fired.current = true; chime('done', sounds); setSt({ startedAt: null, elapsed: total }); onDone?.() } })
  return {
    left, running: st.startedAt !== null, done: left <= 0,
    toggle: () => setSt((s) => (s.startedAt ? { startedAt: null, elapsed: s.elapsed + (Date.now() - s.startedAt) / 1000 } : { startedAt: Date.now(), elapsed: s.elapsed })),
    reset: () => { fired.current = false; setSt({ startedAt: null, elapsed: 0 }) },
  }
}

// ── Day 0 intro ──────────────────────────────────────────────────────────────
function Intro({ a }: { a: Active }) {
  const person = usePerson()
  const patch = useStore((s) => s.patchActive)
  const set = useStore((s) => s.set)
  const profile = useStore((s) => s.profiles[person])
  const setTab = useStore((s) => s.setTab)
  const [kg, setKg] = useState(profile.weightKg)
  const tog = (k: string) => patch((x) => { x.checks[k] = !x.checks[k] })
  const Row = ({ k, label }: { k: string; label: string }) => (
    <button type="button" onClick={() => tog(k)} className="w-full min-h-[52px] flex items-center gap-3 text-left px-3 rounded-2xl bg-s2 border border-line/60" aria-pressed={!!a.checks[k]}>
      <span className={cx('w-7 h-7 rounded-full grid place-items-center border shrink-0', a.checks[k] ? 'accent-grad border-transparent text-[#08080c]' : 'border-line')}>{a.checks[k] && <Check size={16} />}</span>
      <span className={cx('text-[15px]', a.checks[k] && 'text-mute line-through')}>{label}</span>
    </button>
  )
  return (
    <>
      <Top title="Day 0 — Orientation" sub="About 45 min · no pressure today" />
      <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
        <h2 className="display text-[26px] font-semibold mt-2">Welcome, {NAME[person]}.</h2>
        <p className="text-mute text-[15px] mt-1">Today is just a look around: a baseline, a gym tour, and finding easy starting weights.</p>
        <h3 className="display font-semibold mt-5 mb-2">1 · Baseline</h3>
        <div className="space-y-2">
          <div className="rounded-2xl bg-s2 border border-line/60 p-3">
            <div className="text-[14px] mb-2">{DAY0.baseline[0]}</div>
            <div className="flex items-center justify-between gap-2">
              <Stepper value={kg} onChange={setKg} step={0.1} min={30} max={200} unit="kg" label="Body weight" big />
              <Btn kind={a.checks.weigh ? 'soft' : 'primary'} onClick={async () => { await setWeight(person, a.date, kg); set((s) => { s.profiles[person].weightKg = kg }); patch((x) => { x.checks.weigh = true }) }}>{a.checks.weigh ? <><Check size={16} /> Saved</> : 'Save'}</Btn>
            </div>
          </div>
          <Row k="measure" label={DAY0.baseline[1]} />
          <Row k="photos" label={DAY0.baseline[2]} />
          <button type="button" className="text-[13px] accent-text underline min-h-[44px]" onClick={() => setTab('progress')}>Open Progress to add measurements and photos (your session stays open)</button>
          <p className="text-[12px] text-mute">Photos are stored only on this device.</p>
        </div>
        <h3 className="display font-semibold mt-5 mb-2">2 · Gym tour — find these</h3>
        <div className="space-y-2">{DAY0.tour.map((t, i) => <Row key={t} k={`tour${i}`} label={t} />)}</div>
      </div>
      <div className="shrink-0 p-4 safe-b glass border-t border-line/60"><Btn className="w-full" onClick={() => patch((x) => { x.phase = 'warmup' })}>Next: warm-up <ArrowRight size={18} /></Btn></div>
    </>
  )
}

// ── Warm-up ──────────────────────────────────────────────────────────────────
function Warmup({ a, steps, kind, past }: { a: Active; steps: Step[]; kind: string; past: Record<string, Past[]> }) {
  const person = usePerson()
  const patch = useStore((s) => s.patchActive)
  const sounds = useStore((s) => s.settings.sounds)
  const cd = useCountdown(300, sounds)
  const drills = a.isDay0 ? [] : kind === 'lower' ? WARMUP.lower : kind === 'upper' ? WARMUP.upper : kind === 'full' ? [...WARMUP.upper, ...WARMUP.lower] : []
  const first = steps.find((s) => s.star && s.kind === 'lift')
  const firstEx = first ? EX[first.ex] : null
  const working = first ? suggest(past[first.ex] ?? [], first, firstEx!.loadType).weight ?? past[first.ex]?.[0]?.w : undefined
  const tog = (k: string) => patch((x) => { x.checks[k] = !x.checks[k] })
  return (
    <>
      <Top title="Warm-up" sub={a.title} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
        <div className="card p-5 mt-2 text-center">
          <RoutineImage id={ROUTINE_ID[WARMUP.general]} person={person} className="aspect-video w-full mb-3" />
          <div className="text-[13px] text-mute">{a.isDay0 ? DAY0.warmup : WARMUP.general}</div>
          <div className="display text-[64px] font-semibold num leading-none mt-2">{mmss(cd.left)}</div>
          <div className="flex justify-center gap-2 mt-4">
            <Btn onClick={cd.toggle}>{cd.running ? <><Pause size={18} /> Pause</> : cd.done ? <><Check size={18} /> Done</> : <><Play size={18} /> Start 5 min</>}</Btn>
          </div>
        </div>
        {drills.length > 0 && <>
          <h3 className="display font-semibold mt-5 mb-2">Then</h3>
          <div className="space-y-2">{drills.map((d, i) => (
            <button key={d} type="button" onClick={() => tog(`wu${i}`)} aria-pressed={!!a.checks[`wu${i}`]} className="w-full min-h-[52px] flex items-center gap-3 text-left px-3 rounded-2xl bg-s2 border border-line/60">
              <span className={cx('w-7 h-7 rounded-full grid place-items-center border shrink-0', a.checks[`wu${i}`] ? 'accent-grad border-transparent text-[#08080c]' : 'border-line')}>{a.checks[`wu${i}`] && <Check size={16} />}</span>
              <RoutineImage id={ROUTINE_ID[d]} person={person} className="w-16 h-16" />
              <span className="text-[15px]">{d}</span>
            </button>))}</div>
        </>}
        {first && !a.isDay0 && (
          <div className="card p-4 mt-5">
            <div className="text-[13px] text-mute">Ramp-up sets · {exName(first.ex)}</div>
            {working ? (
              <div className="flex gap-2 mt-2 flex-wrap">{rampSets(working, firstEx!.loadType).map((r, i) => <Chip key={i}>{r.w} kg × {r.reps}</Chip>)}<Chip tone="accent">then {working} kg</Chip></div>
            ) : <p className="text-[14px] mt-1">No history yet — do 1–2 easy practice sets before your first working set.</p>}
          </div>
        )}
        <p className="text-[13px] text-mute mt-5">{SAFETY}</p>
      </div>
      <div className="shrink-0 p-4 safe-b glass border-t border-line/60"><Btn className="w-full" onClick={() => patch((x) => { x.phase = 'work' })}>Start lifting <ArrowRight size={18} /></Btn></div>
    </>
  )
}

// ── Work ─────────────────────────────────────────────────────────────────────
function Work({ a, kind, steps, rir, modName, past, prior, loading }: { a: Active; kind: string; steps: Step[]; rir: string; modName: string; past: Record<string, Past[]>; prior: SessionLog[]; loading: boolean }) {
  const person = usePerson()
  const patch = useStore((s) => s.patchActive)
  const set = useStore((s) => s.set)
  const flags = useStore((s) => s.flags)
  const sounds = useStore((s) => s.settings.sounds)
  const [swapOpen, setSwapOpen] = useState(false)
  const [rirOpen, setRirOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [routine, setRoutine] = useState(false)
  const [detail, setDetail] = useState<string | null>('howTo')
  const [burst, setBurst] = useState(0)
  const idx = Math.min(a.idx, steps.length - 1)
  const step = steps[idx]
  const ex = EX[step.ex]
  const hist = past[step.ex] ?? []
  const sug: Suggestion | null = step.kind === 'lift' && ex
    ? (a.isDay0 ? { kind: 'first', weight: null, text: FIRST_TIME } : suggest(hist, step, ex.loadType, { reset: modName === 'Reset' }))
    : null

  // seed the logger rows for this step
  useEffect(() => {
    if (loading || step.kind !== 'lift' || a.sets[step.id]) return
    const [lo, hi] = step.hold ?? step.reps ?? [8, 10]
    const first = Math.min(hi, Math.max(lo, 10))
    const w = isLoadless(ex.loadType) ? 0 : sug?.weight ?? hist[0]?.w ?? 0
    patch((x) => { x.sets[step.id] = Array.from({ length: step.sets }, (_, i) => ({ w, r: step.hold ? hi : sug?.targets?.[i] ?? (hist.length ? hi : first), done: false })) })
  }, [step.id, step.ex, loading]) // eslint-disable-line

  const rows = a.sets[step.id] ?? []
  const go = (n: number) => patch((x) => { x.idx = Math.max(0, Math.min(steps.length - 1, n)) })
  const doneCount = steps.filter((s) => (s.kind === 'lift' ? (a.sets[s.id] ?? []).length > 0 && (a.sets[s.id] ?? []).every((r) => r.done) : a.cardio[s.id]?.done)).length
  const allDone = doneCount === steps.length
  const group = step.group ? steps.filter((s) => s.group === step.group) : []
  const round = step.group ? Math.min(step.sets, Math.min(...group.map((g) => (a.sets[g.id] ?? []).filter((r) => r.done).length)) + 1) : 0

  const tick = (i: number) => {
    const row = rows[i]
    const turningOn = !row.done
    let pr = false
    if (turningOn && !a.isDay0 && !isLoadless(ex.loadType) && ex.loadType !== 'assist') pr = isPR(allSets(prior, step.ex), row.w, row.r)
    patch((x) => {
      const r = x.sets[step.id][i]
      r.done = turningOn; r.t = Date.now()
      if (!turningOn) return
      x.sets[step.id].forEach((o, j) => { if (j > i && !o.done) o.w = r.w })
      if (pr && !x.prs.includes(step.ex)) x.prs.push(step.ex)
      const here = x.sets[step.id]
      const stepDone = here.every((o) => o.done)
      const gi = group.findIndex((g) => g.id === step.id)
      let next = idx
      if (step.group) {
        if (gi < group.length - 1) next = idx + 1
        else next = stepDone ? idx + 1 : idx - (group.length - 1)
      } else if (stepDone) next = idx + 1
      const last = next > steps.length - 1
      next = Math.min(steps.length - 1, next)
      const restFor = step.group && gi < group.length - 1 ? 0 : step.rest
      if (restFor > 0 && !last) {
        const nx = steps[next]
        x.rest = { endsAt: Date.now() + restFor * 1000, total: restFor, label: next === idx ? `Set ${i + 2} of ${x.sets[step.id].length}` : `Next: ${nx.kind === 'lift' ? exName(nx.ex) : nx.label}` }
      }
      x.idx = next
    })
    if (turningOn) { chime('tick', sounds); if (pr) setBurst(Date.now()) }
  }
  const startHold = (i: number) => patch((x) => { const secs = x.sets[step.id][i].r; x.rest = { endsAt: Date.now() + secs * 1000, total: secs, label: 'Hold', hold: { step: step.id, set: i } } })
  const addSet = () => patch((x) => { const cur = x.sets[step.id] ?? []; const l = cur[cur.length - 1]; x.sets[step.id] = [...cur, { w: l?.w ?? 0, r: l?.r ?? (step.hold ? 30 : 10), done: false }] })
  const removeSet = () => patch((x) => { const cur = x.sets[step.id] ?? []; if (cur.length > 1 && !cur[cur.length - 1].done) x.sets[step.id] = cur.slice(0, -1) })
  const edit = (i: number, k: 'w' | 'r', v: number) => patch((x) => { x.sets[step.id][i][k] = v })

  const unit = ex?.loadType === 'assist' ? 'assist kg' : ex?.loadType === 'db' ? 'kg each' : 'kg'
  const wStep = ex?.loadType === 'db' ? 1 : ex?.loadType === 'machine' || ex?.loadType === 'assist' ? 5 : 2.5

  return (
    <>
      <Confetti fire={burst} />
      <Top title={a.title} sub={`${idx + 1} of ${steps.length} · ${modName} week`} right={
        <div className="flex gap-2">
          <button type="button" aria-label="Warm-up and cool-down" data-testid="session-routine" onClick={() => setRoutine(true)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><Flame size={18} /></button>
          <button type="button" aria-label="Session options" onClick={() => setMenu(true)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><X size={18} /></button>
        </div>} />
      <div className="px-4 flex gap-1 shrink-0" role="progressbar" aria-label="Session progress" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={steps.length}>
        {steps.map((s, i) => {
          const d = s.kind === 'lift' ? (a.sets[s.id] ?? []).length > 0 && (a.sets[s.id] ?? []).every((r) => r.done) : a.cardio[s.id]?.done
          return <button key={s.id} type="button" aria-label={`Go to ${i + 1}`} onClick={() => go(i)} className="flex-1 py-2"><span className={cx('block h-1.5 rounded-full', d ? 'accent-grad' : i === idx ? 'bg-ink/70' : 'bg-s3')} /></button>
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div key={step.id + step.ex} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}
            onPanEnd={(_, i) => { if (Math.abs(i.offset.x) > 80 && Math.abs(i.offset.y) < 60) go(idx + (i.offset.x < 0 ? 1 : -1)) }}>
            {a.weekIndex === 1 && a.cycle === 1 && !a.isDay0 && idx === 0 && <div className="rounded-2xl border border-warn/30 bg-warn/10 text-warn text-[13px] px-3 py-2 mb-2">{WEEK1_BANNER}</div>}
            {step.kind === 'lift' && ex ? (
              <>
                <ExerciseMedia ex={ex} person={person} />
                <div className="flex items-start justify-between gap-2 mt-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[12px] text-mute">
                      {step.label && <span className="px-2 py-0.5 rounded-full bg-a1/15 accent-text font-semibold">{step.label}</span>}
                      {step.groupKind && <span>{step.groupKind === 'superset' ? 'Superset' : 'Circuit'} · round {round} of {step.sets}</span>}
                      {step.star && <span className="inline-flex items-center gap-1 accent-text"><Star size={12} fill="currentColor" /> Priority</span>}
                    </div>
                    <h2 className="display text-[24px] leading-tight font-semibold">{ex.name}</h2>
                  </div>
                  {ex.alternatives.length > 0 && <button type="button" onClick={() => setSwapOpen(true)} className="shrink-0 min-h-[44px] px-3 rounded-full bg-s2 border border-line/60 text-[13px] font-medium inline-flex items-center gap-1.5"><Repeat size={14} /> Swap</button>}
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Chip>{rxText(step)}</Chip>
                  {step.rest > 0 && <Chip><Timer size={13} /> {restText(step.rest)}</Chip>}
                  <Chip onClick={() => setRirOpen(true)}>RIR {a.isDay0 ? '4–5' : rir} <Info size={13} /></Chip>
                  {ex.tempo !== 'hold' && <Chip>Tempo {ex.tempo}</Chip>}
                </div>
                {sug && <div className="mt-3 rounded-2xl border border-a1/40 bg-a1/10 px-3 py-2.5">
                  <div className="text-[15px] font-semibold accent-text">{sug.text}</div>
                  {hist[0] && <div className="text-[13px] text-mute num mt-0.5">{lastLine(hist[0], !!step.hold)}</div>}
                  {sug.kind === 'first' && <div className="text-[13px] text-mute mt-0.5">{ex.startingTip}</div>}
                </div>}
                {step.note && <p className="text-[13px] text-mute mt-2">{step.note}</p>}
                {step.gate && <button type="button" onClick={() => { set((s) => { s.profiles[person].squatApproved = true }); patch((x) => { delete x.sets[step.id] }) }}
                  className="mt-2 w-full min-h-[48px] rounded-2xl border border-line bg-s2 text-[14px] font-medium inline-flex items-center justify-center gap-2"><Check size={16} /> {step.gate.label}</button>}
                <div className="card p-3 mt-3">
                  <BodyMap both key={step.ex} primary={ex.muscles.primary} secondary={ex.muscles.secondary} height={230} info />
                  <div className="text-center text-[12px] text-mute mt-1">Tap a muscle to see what it does</div>
                </div>
                <div className="mt-3 space-y-2">
                  {([['howTo', 'How to', ex.howTo], ['cues', 'Cues', ex.cues], ['mistakes', 'Common mistakes', ex.mistakes], ['breathing', 'Breathing & safety', [ex.breathing, ex.safety]]] as const).map(([k, label, list]) => (
                    <div key={k} className="rounded-2xl bg-s1 border border-line/60 overflow-hidden">
                      <button type="button" aria-expanded={detail === k} onClick={() => setDetail(detail === k ? null : k)} className="w-full min-h-[48px] px-4 flex items-center justify-between text-[15px] font-medium">{label}<ChevronDown size={18} className={cx('transition-transform', detail === k && 'rotate-180')} /></button>
                      <AnimatePresence initial={false}>{detail === k && (
                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                          {k === 'howTo'
                            ? <ol className="px-4 pb-3 space-y-1.5 text-[14px] list-decimal list-inside marker:text-mute">{list.map((t) => <li key={t}>{t}</li>)}</ol>
                            : <ul className="px-4 pb-3 space-y-1.5 text-[14px]">{list.map((t) => <li key={t} className="flex gap-2"><span className="accent-text">•</span>{t}</li>)}</ul>}
                        </motion.div>)}</AnimatePresence>
                    </div>))}
                </div>
                <p className="text-[12px] text-mute mt-3">{SAFETY}</p>
              </>
            ) : <CardioBlock a={a} step={step} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Logger — primary actions live in the bottom of the screen */}
      <div className="shrink-0 glass border-t border-line/60 px-3 pt-2 safe-b">
        {step.kind === 'lift' && (
          <div className="max-h-[38dvh] overflow-y-auto no-scrollbar space-y-1.5">
            {loading && <div className="skeleton h-14" />}
            {rows.map((r, i) => {
              const loadless = isLoadless(ex.loadType)
              return (
                <motion.div key={i} layout className={cx('flex items-center gap-1 rounded-2xl px-1.5 py-1.5 border', r.done ? 'border-a1/40 bg-a1/10' : 'border-line/60 bg-s2/60')}>
                  <span className="w-4 text-center text-[13px] text-mute num shrink-0">{i + 1}</span>
                  {!loadless && <Stepper value={r.w} onChange={(v) => edit(i, 'w', v)} step={wStep} unit={unit} label={`Set ${i + 1} weight`} tight />}
                  <div className={cx(loadless && 'flex-1 flex justify-center')}>
                    <Stepper value={r.r} onChange={(v) => edit(i, 'r', v)} step={step.hold ? 5 : 1} unit={step.hold ? 'sec' : step.perSide ? 'per side' : 'reps'} label={`Set ${i + 1} ${step.hold ? 'seconds' : 'reps'}`} tight />
                  </div>
                  {step.hold && !r.done && <button type="button" aria-label={`Start ${r.r} second hold`} onClick={() => startHold(i)} className="w-11 h-12 grid place-items-center rounded-xl bg-s2 border border-line/70 shrink-0"><Timer size={18} /></button>}
                  <motion.button type="button" aria-label={r.done ? `Set ${i + 1} done — tap to undo` : `Mark set ${i + 1} done`} aria-pressed={r.done} whileTap={{ scale: 0.86 }} onClick={() => tick(i)}
                    className={cx('ml-auto w-12 h-12 rounded-2xl grid place-items-center shrink-0 border', r.done ? 'accent-grad border-transparent text-[#08080c]' : 'border-line bg-s1')}>
                    <motion.span key={String(r.done)} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring}><Check size={22} strokeWidth={3} /></motion.span>
                  </motion.button>
                </motion.div>
              )
            })}
            {!loading && rows.length > 0 && (
              <div className="flex gap-2 pt-0.5">
                <button type="button" data-testid="add-set" onClick={addSet} className="flex-1 min-h-[44px] rounded-2xl border border-dashed border-line text-[14px] font-medium text-mute inline-flex items-center justify-center gap-1.5"><Plus size={16} /> Add set</button>
                {rows.length > 1 && !rows[rows.length - 1].done && <button type="button" data-testid="remove-set" onClick={removeSet} className="min-h-[44px] px-4 rounded-2xl border border-line/60 text-[14px] text-mute">Remove set {rows.length}</button>}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 py-2">
          <button type="button" aria-label="Previous exercise" disabled={idx === 0} onClick={() => go(idx - 1)} className="w-12 h-12 grid place-items-center rounded-2xl bg-s2 border border-line/60 disabled:opacity-30"><ArrowLeft size={20} /></button>
          {allDone || idx === steps.length - 1
            ? <Btn className="flex-1" onClick={() => patch((x) => { x.phase = a.isDay0 ? 'finish' : 'cooldown'; x.rest = null })}>{allDone ? 'Finish session' : 'Finish early'} <ArrowRight size={18} /></Btn>
            : <Btn kind="soft" className="flex-1" onClick={() => go(idx + 1)}>Next: {steps[idx + 1].kind === 'lift' ? exName(steps[idx + 1].ex) : steps[idx + 1].label} <ArrowRight size={16} /></Btn>}
        </div>
      </div>

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title="Swap exercise">
        <p className="text-[14px] text-mute mb-3">Machine busy, or something doesn’t feel right? Pick an alternative for today.</p>
        <div className="space-y-2">{(ex?.alternatives ?? []).map((id) => (
          <button key={id} type="button" className="w-full min-h-[56px] px-4 rounded-2xl bg-s2 border border-line/60 text-left" onClick={() => { patch((x) => { x.swaps[step.id] = id; delete x.sets[step.id] }); setSwapOpen(false) }}>
            <div className="font-medium">{exName(id)}</div><div className="text-[12px] text-mute">{EX[id].equipment.join(' · ')}</div>
          </button>))}
          {a.swaps[step.id] && <Btn kind="ghost" className="w-full" onClick={() => { patch((x) => { delete x.swaps[step.id]; delete x.sets[step.id] }); setSwapOpen(false) }}>Back to the planned exercise</Btn>}
        </div>
      </Sheet>
      <Sheet open={rirOpen || (!flags.rir && step.kind === 'lift')} onClose={() => { setRirOpen(false); set((s) => { s.flags.rir = true }) }} title="Effort: RIR">
        <p className="text-[15px]">{RIR_EXPLAIN}</p>
        <div className="mt-4 flex items-end gap-1.5 h-24" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <motion.div key={i} className={cx('flex-1 rounded-md', i < 8 ? 'accent-grad' : 'bg-s3 border border-dashed border-line')} initial={{ height: 0 }} animate={{ height: `${40 + i * 6}%` }} transition={{ delay: i * 0.06 }} />))}
        </div>
        <div className="flex justify-between text-[12px] text-mute mt-1"><span>8 reps done</span><span>2 left in reserve = RIR 2</span></div>
        <Btn className="w-full mt-5" onClick={() => { setRirOpen(false); set((s) => { s.flags.rir = true }) }}>Got it</Btn>
      </Sheet>
      <RoutineSheet open={routine} initial="warm" dayKind={kind} onClose={() => setRoutine(false)} />
      <Sheet open={menu} onClose={() => setMenu(false)} title="Session">
        <div className="space-y-2">
          <Btn kind="soft" className="w-full" onClick={() => { setMenu(false); useStore.getState().open(null) }}><ChevronDown size={18} /> Minimise — keep it running</Btn>
          <Btn className="w-full" onClick={() => { setMenu(false); patch((x) => { x.phase = 'finish'; x.rest = null }) }}><Check size={18} /> Finish now and save</Btn>
          <Btn kind="danger" className="w-full" onClick={() => { useStore.setState((s) => ({ active: { ...s.active, [person]: null }, overlay: null })) }}><Trash2 size={18} /> Discard this session</Btn>
        </div>
      </Sheet>
    </>
  )
}

// ── Cardio / mobility block ──────────────────────────────────────────────────
function CardioBlock({ a, step }: { a: Active; step: Step }) {
  const person = usePerson()
  const patch = useStore((s) => s.patchActive)
  const sounds = useStore((s) => s.settings.sounds)
  const st = a.cardio[step.id] ?? { startedAt: null, elapsed: 0, done: false }
  useTick(250, st.startedAt !== null)
  const iv = step.intervals
  const planMin = step.minutes ?? 10
  const [editT, setEditT] = useState(false)
  const tMin = a.cardioMin?.[step.id] ?? planMin
  const total = iv ? iv.rounds * (iv.work + iv.easy) : tMin * 60
  const free = step.kind === 'cardio' && !iv   // plain cardio keeps counting past the target
  const raw = st.elapsed + (st.startedAt ? (Date.now() - st.startedAt) / 1000 : 0)
  const el = free ? raw : Math.min(total, raw)
  const left = total - el
  const cyc = iv ? iv.work + iv.easy : 0
  const hard = iv ? el % cyc < iv.work : false
  const rnd = iv ? Math.min(iv.rounds, Math.floor(el / cyc) + 1) : 0
  const segLeft = iv ? (hard ? iv.work - (el % cyc) : cyc - (el % cyc)) : 0
  const guide = step.kind === 'mobility' ? COOLDOWN[Math.floor(el / 60) % COOLDOWN.length] : null
  const phaseKey = iv ? `${rnd}${hard}` : guide ?? ''
  const lastKey = useRef(phaseKey)
  useEffect(() => { if (st.startedAt && lastKey.current !== phaseKey) { lastKey.current = phaseKey; chime(iv && hard ? 'done' : 'soft', sounds) } })
  useEffect(() => {
    if (!st.startedAt || left > 0) return
    if (!free) { chime('done', sounds); patch((x) => { x.cardio[step.id] = { startedAt: null, elapsed: total, done: true } }); return }
    if (!st.done) { chime('done', sounds); patch((x) => { const c = x.cardio[step.id]; if (c) x.cardio[step.id] = { ...c, done: true } }) }   // target reached: tick it off, keep the clock running
  })
  const toggle = () => patch((x) => { const c = x.cardio[step.id] ?? { startedAt: null, elapsed: 0, done: false }; x.cardio[step.id] = c.startedAt ? { ...c, startedAt: null, elapsed: c.elapsed + (Date.now() - c.startedAt) / 1000 } : { ...c, startedAt: Date.now() } })
  const ex = EX[step.ex]
  return (
    <div>
      {ex && <ExerciseMedia ex={ex} person={person} />}
      <h2 className="display text-[24px] font-semibold mt-3">{step.label}</h2>
      {step.note && <p className="text-[14px] text-mute">{step.note}</p>}
      <div className={cx('card p-5 mt-3 text-center transition-colors', !!iv && !!st.startedAt && hard && 'border-a1/60 bg-a1/10')}>
        {iv && <div className="text-[13px] text-mute">Round {rnd} of {iv.rounds}</div>}
        {iv && <div className={cx('display text-[30px] font-semibold', hard ? 'accent-grad-text' : 'text-ink')}>{hard ? iv.workLabel : iv.easyLabel} · {mmss(segLeft)}</div>}
        {guide && <div className="display text-[22px] font-semibold accent-text">{guide}</div>}
        <div className="display text-[64px] font-semibold num leading-none mt-1">{free ? mmss(el) : mmss(left)}</div>
        <div className="text-[12px] text-mute mt-1">{free ? (el >= total ? `Target ${mmss(total)} reached${el > total ? ` · +${mmss(el - total)}` : ''}` : `of ${mmss(total)} target`) : st.done ? 'Complete' : 'remaining'}</div>
        {!iv && <>
          <button type="button" data-testid="edit-target" onClick={() => setEditT((v) => !v)} className="mt-1 min-h-[36px] px-3 rounded-full text-[13px] font-medium accent-text inline-flex items-center gap-1.5"><Pencil size={13} /> {editT ? 'Done' : `Change target (${tMin} min)`}</button>
          {editT && <div className="flex justify-center mt-1"><Stepper value={tMin} onChange={(v) => patch((x) => { x.cardioMin = { ...(x.cardioMin ?? {}), [step.id]: Math.max(1, Math.min(240, Math.round(v))) } })} step={5} min={1} max={240} unit="min" label="Target minutes" /></div>}
        </>}
        <div className="flex justify-center gap-2 mt-4">
          <Btn onClick={toggle} disabled={st.done && !free}>{st.startedAt ? <><Pause size={18} /> Pause</> : <><Play size={18} /> {el > 0 ? 'Resume' : 'Start'}</>}</Btn>
          <Btn kind="soft" onClick={() => patch((x) => { x.cardio[step.id] = { startedAt: null, elapsed: el, done: free && st.startedAt ? true : !st.done } })}><Check size={18} /> {free && st.startedAt ? 'Stop' : st.done ? 'Undo' : 'Mark done'}</Btn>
        </div>
      </div>
      {step.kind === 'cardio' && !iv && (
        <div className="card p-4 mt-3">
          <div className="text-[13px] font-semibold mb-2">Heart-rate zone guide</div>
          <div className="space-y-1.5 text-[13px]">
            {[['Zone 1', 'Very easy — full conversation', 0.3], ['Zone 2', 'Easy — talk in short sentences', 0.55], ['Zone 3', 'Moderate — a few words at a time', 0.75], ['Zone 4–5', 'Hard — can’t talk', 1]].map(([z, d, w]) => (
              <div key={z as string} className="flex items-center gap-2"><span className="w-16 text-mute">{z}</span><span className="h-2 rounded-full accent-grad" style={{ width: `${(w as number) * 30}%`, opacity: z === 'Zone 2' ? 1 : 0.35 }} /><span className={z === 'Zone 2' ? 'font-medium' : 'text-mute'}>{d}</span></div>))}
          </div>
          <p className="text-[12px] text-mute mt-2">Progress: add 2 min or 1% incline per week, up to the cap.</p>
        </div>
      )}
      {ex && <div className="mt-3 text-[14px] space-y-1">{ex.cues.map((c) => <div key={c} className="flex gap-2"><span className="accent-text">•</span>{c}</div>)}</div>}
    </div>
  )
}

// ── Rest timer overlay ───────────────────────────────────────────────────────
function RestOverlay({ steps }: { steps: Step[] }) {
  const person = usePerson()
  const rest = useStore((s) => s.active[person]?.rest ?? null)
  const patch = useStore((s) => s.patchActive)
  const sounds = useStore((s) => s.settings.sounds)
  useTick(200, !!rest)
  const flags = useRef({ ten: false, key: 0 })
  const left = rest ? (rest.endsAt - Date.now()) / 1000 : 0
  useEffect(() => {
    if (!rest) return
    if (flags.current.key !== rest.endsAt - rest.total * 1000) flags.current = { ten: left <= 10, key: rest.endsAt - rest.total * 1000 }
    if (!rest.hold && left <= 10 && left > 0 && !flags.current.ten) { flags.current.ten = true; chime('soft', sounds) }
    if (left <= 0) {
      chime('done', sounds)
      patch((x) => {
        const h = x.rest?.hold
        x.rest = null
        if (h) {
          const st = steps.find((s) => s.id === h.step)
          const row = x.sets[h.step]?.[h.set]
          if (row && st) { row.done = true; row.t = Date.now(); if (st.rest > 0) x.rest = { endsAt: Date.now() + st.rest * 1000, total: st.rest, label: 'Rest' } }
        }
      })
    }
  })
  const adj = (d: number) => patch((x) => { if (x.rest) { x.rest.endsAt += d * 1000; x.rest.total = Math.max(5, x.rest.total + d) } })
  const size = 260, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <AnimatePresence>
      {rest && (
        <motion.div className="fixed inset-0 z-[70] bg-bg/95 backdrop-blur-xl flex flex-col items-center justify-center safe-b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="timer" aria-label={rest.hold ? 'Hold timer' : 'Rest timer'}>
          <div className="text-[13px] uppercase tracking-[0.2em] text-mute">{rest.hold ? 'Hold' : 'Rest'}</div>
          <div className="relative mt-4" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
              <defs><linearGradient id="rt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--a1c)" /><stop offset="1" stopColor="var(--a2c)" /></linearGradient></defs>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--s3))" strokeWidth={stroke} />
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rt)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, left / rest.total)))} style={{ transition: 'stroke-dashoffset .25s linear' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center"><span className="display text-[72px] font-semibold num">{mmss(Math.ceil(left))}</span></div>
          </div>
          {!rest.hold && <div className="mt-4 text-[15px] text-mute text-center px-8">{rest.label}</div>}
          <div className="flex items-center gap-3 mt-10">
            <Btn kind="soft" onClick={() => adj(-15)} label="Minus 15 seconds">−15 s</Btn>
            <Btn onClick={() => patch((x) => { x.rest = null })} label={rest.hold ? 'Cancel hold' : 'Skip rest'}><SkipForward size={18} /> {rest.hold ? 'Cancel' : 'Skip'}</Btn>
            <Btn kind="soft" onClick={() => adj(15)} label="Plus 15 seconds">+15 s</Btn>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Cool-down ────────────────────────────────────────────────────────────────
function Cooldown() {
  const person = usePerson()
  const patch = useStore((s) => s.patchActive)
  const sounds = useStore((s) => s.settings.sounds)
  const [i, setI] = useState(0)
  const cd = useCountdown(COOLDOWN_HOLD, sounds, () => setTimeout(() => { setI((x) => x + 1) }, 400))
  useEffect(() => { if (i > 0 && i < COOLDOWN.length) { cd.reset(); setTimeout(cd.toggle, 50) } }, [i]) // eslint-disable-line
  const over = i >= COOLDOWN.length
  return (
    <>
      <Top title="Cool-down" sub="5 stretches · 30 s each" />
      <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
        <div className="card p-6 mt-2 text-center">
          {!over && <RoutineImage id={ROUTINE_ID[COOLDOWN[i]]} person={person} className="aspect-video w-full mb-3" />}
          <div className="text-[13px] text-mute">{over ? 'All done' : `Stretch ${i + 1} of ${COOLDOWN.length}`}</div>
          <div className="display text-[26px] font-semibold mt-1">{over ? 'Nice work.' : COOLDOWN[i]}</div>
          {!over && <div className="display text-[64px] font-semibold num leading-none mt-3">{mmss(Math.ceil(cd.left))}</div>}
          {!over && <div className="flex justify-center gap-2 mt-4">
            <Btn onClick={cd.toggle}>{cd.running ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Start</>}</Btn>
            <Btn kind="soft" onClick={() => setI(i + 1)}><SkipForward size={18} /> Next</Btn>
          </div>}
        </div>
        <ol className="mt-4 space-y-1.5">{COOLDOWN.map((s, j) => <li key={s} className={cx('flex items-center gap-2 text-[14px]', j < i ? 'text-mute line-through' : j === i ? 'font-medium' : 'text-mute')}><span className={cx('w-5 h-5 rounded-full grid place-items-center text-[11px]', j < i ? 'accent-grad text-[#08080c]' : 'bg-s3')}>{j < i ? <Check size={12} /> : j + 1}</span>{s}</li>)}</ol>
      </div>
      <div className="shrink-0 p-4 safe-b glass border-t border-line/60 flex gap-2">
        <Btn kind="soft" label="Back to workout" onClick={() => patch((x) => { x.phase = 'work' })}><ArrowLeft size={18} /> Workout</Btn>
        <Btn className="flex-1" onClick={() => patch((x) => { x.phase = 'finish' })}>{over ? 'See summary' : 'Skip to summary'} <ArrowRight size={18} /></Btn></div>
    </>
  )
}

// ── Finish ───────────────────────────────────────────────────────────────────
function Finish({ a, steps, onDone }: { a: Active; steps: Step[]; onDone: () => void }) {
  const person = usePerson()
  const say = useStore((s) => s.say)
  const [mood, setMood] = useState(4)
  const [energy, setEnergy] = useState(4)
  const [notes, setNotes] = useState('')
  const [fire, setFire] = useState(0)
  const [saving, setSaving] = useState(false)
  const endRef = useRef(Date.now())
  const minutes = Math.max(1, Math.round((endRef.current - a.startedAt) / 60000))
  const doneSteps = steps.filter((s) => (a.sets[s.id] ?? []).some((r) => r.done) || a.cardio[s.id]?.done)
  const setsDone = Object.values(a.sets).reduce((n, rows) => n + rows.filter((r) => r.done).length, 0)
  const volume = Math.round(steps.reduce((v, s) => {
    const t = EX[s.ex]?.loadType
    if (!t || isLoadless(t) || t === 'assist') return v
    return v + (a.sets[s.id] ?? []).filter((r) => r.done).reduce((x, r) => x + r.w * r.r * (t === 'db' ? 2 : 1) * (s.perSide && t !== 'db' ? 2 : 1), 0)
  }, 0))
  const m = sessionMuscles(doneSteps)
  const cardioSec = steps.filter((x) => x.kind === 'cardio').reduce((n, x) => { const c = a.cardio[x.id]; return n + (c ? c.elapsed + (c.startedAt ? (endRef.current - c.startedAt) / 1000 : 0) : 0) }, 0)
  useEffect(() => { if (a.prs.length) setFire(Date.now()) }, []) // eslint-disable-line
  const save = async () => {
    setSaving(true)
    const cardio = Object.fromEntries(steps.filter((x) => x.kind === 'cardio').map((x) => { const c = a.cardio[x.id]; return [x.id, Math.round(c ? c.elapsed + (c.startedAt ? (endRef.current - c.startedAt) / 1000 : 0) : 0)] as const }).filter(([, v]) => v > 0))
    const log: SessionLog = {
      id: a.id, person, date: a.date, key: a.key, title: a.title, cycle: a.cycle, weekIndex: a.weekIndex, startedAt: a.startedAt, finishedAt: endRef.current,
      sets: a.sets, exOf: Object.fromEntries(steps.map((s) => [s.id, s.ex])), ...(Object.keys(cardio).length ? { cardio } : {}), mood, energy, notes, volume, prs: a.prs, updatedAt: Date.now(),
    }
    await db.sessions.put(log)
    useStore.setState((s) => ({ active: { ...s.active, [person]: null } }))
    say(a.isDay0 ? DAY0.finish : 'Session saved. Well done.')
    onDone()
  }
  const css = getComputedStyle(document.documentElement)
  return (
    <>
      <Confetti fire={fire} />
      <Top title="Summary" sub={fmtDate(a.date)} />
      <div className="flex-1 overflow-y-auto px-4 pb-4 no-scrollbar">
        <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="display text-[30px] leading-tight font-semibold mt-2">{a.isDay0 ? 'Baseline saved.' : `${a.title} — done.`}</motion.h2>
        <p className="text-mute">{a.isDay0 ? 'Week 1 starts tomorrow.' : `That’s one more in the bank, ${NAME[person]}.`}</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[['Minutes', minutes], ['Sets', setsDone], ['Volume kg', volume]].map(([l, v]) => (
            <div key={l as string} className="card p-3 text-center"><div className="display text-[26px] font-semibold num">{(v as number).toLocaleString('en-IN')}</div><div className="text-[12px] text-mute">{l}</div></div>))}
        </div>
        {cardioSec > 0 && <div className="text-[13px] text-mute text-center mt-2" data-testid="cardio-line">Cardio timed: {fmtDuration(cardioSec)}</div>}
        {a.prs.length > 0 && <div className="card p-4 mt-3 border-a1/40">
          <div className="flex items-center gap-2 font-semibold accent-text"><Trophy size={18} /> {a.prs.length} personal record{a.prs.length > 1 ? 's' : ''}</div>
          <div className="flex flex-wrap gap-2 mt-2">{a.prs.map((p) => <Chip key={p} tone="accent"><Flame size={13} /> {exName(p)}</Chip>)}</div>
        </div>}
        {(m.primary.length > 0) && <div className="card p-3 mt-3"><div className="text-[13px] text-mute text-center">Muscles trained today</div><BodyMap both primary={m.primary as MuscleId[]} secondary={m.secondary as MuscleId[]} height={200} /></div>}
        <div className="card p-4 mt-3 space-y-3">
          {([['Mood', mood, setMood], ['Energy', energy, setEnergy]] as const).map(([l, v, f]) => (
            <div key={l}><div className="text-[13px] text-mute mb-1.5">{l}</div>
              <div className="flex gap-2" role="radiogroup" aria-label={l}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${l} ${n} of 5`} onClick={() => f(n)} className={cx('flex-1 h-12 rounded-xl border font-semibold num', v === n ? 'accent-grad text-[#08080c] border-transparent' : 'bg-s2 border-line/60')}>{n}</button>)}</div></div>))}
          <textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes — how did it feel?" rows={2} className="w-full rounded-xl bg-s2 border border-line/60 p-3 outline-none" />
        </div>
      </div>
      <div className="shrink-0 p-4 safe-b glass border-t border-line/60 flex gap-2">
        {!a.isDay0 && <Btn kind="soft" label="Share card" onClick={() => shareCard({ name: NAME[person], title: a.title, date: fmtDate(a.date, { weekday: 'long', day: 'numeric', month: 'long' }), minutes, volume, sets: setsDone, prs: a.prs.length, c1: css.getPropertyValue('--a1c').trim() || '#4c8dff', c2: css.getPropertyValue('--a2c').trim() || '#22d3ee' })}><Share2 size={18} /></Btn>}
        <Btn className="flex-1" disabled={saving} onClick={save}><Check size={18} /> Save session</Btn>
      </div>
    </>
  )
}
