import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CalendarOff, Check, Pencil, Clock, Droplets, Dumbbell, Flame, Footprints, Moon, Play, Timer, Shuffle, Sparkles, Utensils, Wind } from 'lucide-react'
import { useStore, usePerson, useWeightHidden } from '../store'
import { NAME, PEOPLE, WD_LABEL, WEEKDAYS, type Person, type Weekday } from '../types'
import { db, dayId, patchDay, setWeight, useLive, type DayRow } from '../db'
import { useNow, usePosition, useSessions, useSkipMap, useSkips } from '../lib/hooks'
import { describeMoves, gymDayFn, offDayOf, previewSkip, weekPlan, weekStartOf } from '../engine/schedule'
import { syncReminders } from '../lib/reminders'
import { SessionEditor } from '../components/SessionEditor'
import { RoutineSheet, type Routine } from '../components/RoutineSheet'
import { startCore, startSession, todayPlan } from '../lib/session'
import { cardioTarget, coreOn } from '../data/core'
import { cardioTotals, fmtDuration } from '../lib/cardio'
import { CardioTimer } from '../components/CardioTimer'
import { exName } from '../data/exercises'
import { PROGRAMS, resolveSession, sessionMuscles } from '../engine/program'
import { addDays, fmtDate, greeting, istClock, istLong, istMinutes, week1Start } from '../engine/calendar'
import { streak, weekKeys, otherPerson } from '../lib/history'
import { PLANS, dayMenu, optionById } from '../engine/rotation'
import { fmtMin, mealName, mealTimes, scaleDay, targets, waterTarget } from '../engine/nutrition'
import { BodyMap } from '../components/BodyMap'
import { Btn, Card, Chip, Ring, Section, Sheet, Stepper, Ticker, cx, item, stagger } from '../components/ui'
import { downloadBackup } from '../lib/backup'
import { extrasOf } from '../lib/insights'

const FULL_DAY: Record<Weekday, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
const WATER_L: Record<Person, number> = { vikas: 3.5, varsha: 2.75 }
const STEPS: Record<Person, number> = { vikas: 7500, varsha: 9500 }
export const GLASS = 0.25
export const dayIndex = (wd: Weekday) => WEEKDAYS.indexOf(wd)

export function useDay(person: Person, date: string): DayRow {
  return useLive<DayRow>(async () => (await db.days.get(dayId(person, date))) ?? { id: dayId(person, date), person, date, eaten: {}, swaps: {}, water: 0, steps: 0, updatedAt: 0 }, [person, date],
    { id: '', person, date, eaten: {}, swaps: {}, water: 0, steps: 0, updatedAt: 0 })
}

/** Today's menu for a person with swaps and portions applied. */
export function useMenu(person: Person, weekInMonth: number, dIdx: number, swaps: Record<string, string>) {
  const profile = useStore((s) => s.profiles[person])
  return useMemo(() => {
    const plan = PLANS[person]
    const base = dayMenu(person, weekInMonth, dIdx, profile.veg)
    const picks = { ...base, ...swaps }
    const chosen = plan.slots.map((s) => ({ slot: s.id, option: optionById(plan, picks[s.id]) ?? optionById(plan, base[s.id])! }))
    const t = targets(person, profile)
    const scaled = scaleDay(chosen, t.kcal)
    const times = mealTimes(plan.slots.map((s) => s.id), profile.gymTime)
    return { plan, chosen, scaled, times, t, base }
  }, [person, weekInMonth, dIdx, JSON.stringify(swaps), profile]) // eslint-disable-line
}

export function Today() {
  const person = usePerson()
  const profile = useStore((s) => s.profiles[person])
  const settings = useStore((s) => s.settings)
  const flags = useStore((s) => s.flags)
  const active = useStore((s) => s.active[person])
  const weightHidden = useWeightHidden(person)
  const { open, setTab, set, say } = useStore.getState()
  const d = useNow(15000)
  const pos = usePosition()
  const sessions = useSessions()
  const day = useDay(person, pos.date)
  const [pick, setPick] = useState(false)
  const skips = useSkips(person)
  const skipMap = useSkipMap(person)
  const skippedToday = skips.has(pos.date)
  const [skipOpen, setSkipOpen] = useState(false)
  const [offAsk, setOffAsk] = useState<string | null>(null)   // the reason chosen, while we ask about the day off
  const [editId, setEditId] = useState<string | null>(null)
  const [routine, setRoutine] = useState<Routine | null>(null)
  const lastRoutine = useRef<Routine>('warm')
  if (routine) lastRoutine.current = routine
  const [stepsOpen, setStepsOpen] = useState(false)
  const [cardioOpen, setCardioOpen] = useState(false)
  const [cardioEx, setCardioEx] = useState('incline-walk')
  const [kg, setKg] = useState(profile.weightKg)
  const todayW = useLive(() => db.weights.get(dayId(person, pos.date)), [person, pos.date], undefined)
  useEffect(() => { setKg(todayW?.kg ?? profile.weightKg) }, [todayW?.kg, profile.weightKg, person])

  const coreLog = useLive(() => db.sessions.get(`${person}|${pos.date}|core`), [person, pos.date], undefined)
  const coreDone = !!coreLog?.finishedAt
  const coreActive = active?.key === 'core'
  const showCore = coreOn(person, profile) && (pos.phase === 'program' || pos.phase === 'day0')
  const cTarget = cardioTarget(person, profile)
  const cardioSec = cardioTotals(sessions ?? [], [day], pos.date, pos.date).seconds
  const addCardio = (min: number) => { void patchDay(person, pos.date, (x) => { x.cardio = [...(x.cardio ?? []), { id: `${Date.now()}`, ex: cardioEx, sec: min * 60 }] }); say(`${min} min of ${exName(cardioEx).toLowerCase()} added`) }

  const offDay = offDayOf(person, profile)
  const sched = useMemo(() => (pos.phase === 'program' ? weekPlan(person, weekStartOf(pos.date), offDay, skipMap) : null), [person, pos.date, pos.phase, offDay, skipMap])
  const slot = sched ? sched.slots[WEEKDAYS.indexOf(pos.weekday)] : null
  /** Same as pos, but with the session that really sits on today after the day off and any skipped days. */
  const epos = slot ? { ...pos, weekday: slot.session } : pos
  const plan = todayPlan(person, epos, profile)
  const res = plan.kind === 'day' || plan.kind === 'day0' ? plan.res : null
  const doneKeys = weekKeys(sessions ?? [], pos.cycle, pos.weekIndex)
  const todayKey = plan.kind === 'day0' ? 'day0' : epos.weekday
  const doneToday = (sessions ?? []).find((s) => s.date === pos.date && s.finishedAt)
  const thisDone = plan.kind === 'day0' ? (sessions ?? []).some((s) => s.key === 'day0') : doneKeys.has(todayKey)
  const muscles = res ? sessionMuscles(res.steps) : null
  const wIdx = pos.phase === 'program' ? pos.weekInMonth : 1
  const dIdx = pos.phase === 'program' ? dayIndex(pos.weekday) : 6
  const menu = useMenu(person, wIdx, dIdx, day.swaps)

  const missed = useMemo(() => {
    if (pos.phase !== 'program' || !sessions || !sched) return null
    for (const sl of sched.slots.slice(0, dayIndex(pos.weekday))) {
      const def = PROGRAMS[person].days[sl.session]
      if (sl.off || sl.skipped || ['rest', 'active'].includes(def.kind) || doneKeys.has(sl.session)) continue
      if (pos.mergedDay0 && sl.day === 'mon') continue
      return { wd: sl.session, title: def.title }
    }
    return null
  }, [pos, sessions, person, sched]) // eslint-disable-line

  const mins = istMinutes(d)
  const next = menu.plan.slots.map((s) => ({ s, at: menu.times[s.id] ?? 0 })).filter((x) => !day.eaten[x.s.id]).sort((a, b) => a.at - b.at).find((x) => x.at >= mins - 45)
  const nextOpt = next ? menu.chosen.find((c) => c.slot === next.s.id)!.option : null
  const until = next ? Math.round(next.at - mins) : 0
  const proteinEaten = menu.chosen.reduce((n, c) => n + (day.eaten[c.slot] ? menu.scaled.protein[c.slot] ?? 0 : 0), 0) + extrasOf(day).protein
  const stk = streak(sessions ?? [], pos.date, settings.programStart, skips, gymDayFn(person, offDay, skipMap))
  const positionLabel = pos.phase === 'program' ? `Month ${pos.month} · Week ${pos.weekInMonth} · ${res && 'mod' in res ? res.mod.name : ''} · Day ${pos.dayNumber}${pos.cycle > 1 ? ` · Cycle ${pos.cycle}` : ''}`
    : pos.phase === 'day0' ? 'Day 0 · Orientation' : pos.phase === 'before' ? `Starts ${fmtDate(settings.programStart)}` : 'Week 1 starts tomorrow'

  const begin = (wd: Weekday, isDay0 = false) => {
    const title = isDay0 ? 'Day 0 — Orientation' : PROGRAMS[person].days[wd].title
    startSession(person, pos, { weekday: wd, isDay0, title })   // wd is the session, not the calendar day
  }
  const [gh, gm] = profile.gymTime.split(':').map(Number)
  const gymAt = (gh || 7) * 60 + (gm || 0)
  const doSkip = (reason: string, useOff?: boolean) => {
    setSkipOpen(false); setOffAsk(null)
    void patchDay(person, pos.date, (x) => { x.skip = useOff === undefined ? { reason } : { reason, useOff } }).then(() => syncReminders().catch(() => undefined))
    say('Noted. Your sessions have moved.')
  }
  const workoutDue = !active && !thisDone && !skippedToday && plan.kind === 'day' && !!res && res.def.kind !== 'rest' && res.def.kind !== 'active' && mins >= gymAt - 30 && mins <= gymAt + 150
  const glassesTarget = Math.round(waterTarget(person, profile) / GLASS)
  const glassesByNow = Math.round(glassesTarget * Math.min(1, Math.max(0, (mins - 7 * 60) / (21 * 60 - 7 * 60))))
  const nextAction: { title: string; sub: string; cta: string; go: () => void } | null = (() => {
    if (pos.phase === 'before' || active || workoutDue) return null
    if (next && nextOpt && until <= 20) return { title: `${until <= 0 ? 'Time for' : 'Soon:'} ${next.s.label.toLowerCase()}`, sub: `${mealName(nextOpt, menu.scaled.qty[next.s.id])} · ≈ ${menu.scaled.kcal[next.s.id]} kcal`, cta: 'Ate it', go: () => { void patchDay(person, pos.date, (x) => { x.eaten[next.s.id] = true }); say(`${next.s.label} logged`) } }
    if (glassesByNow - day.water >= 2) return { title: 'Drink some water', sub: `${day.water} of ${glassesTarget} glasses so far. About ${glassesByNow} by now.`, cta: '+1 glass', go: () => { void patchDay(person, pos.date, (x) => { x.water += 1 }); say('+1 glass (250 ml)') } }
    if (!todayW && mins < 12 * 60) return { title: 'Morning weigh-in', sub: 'After the toilet, before food.', cta: 'Weigh in', go: () => document.getElementById('weigh-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
    if (!day.steps && mins >= 18 * 60) return { title: 'Log today’s steps', sub: 'From the Health app.', cta: 'Add steps', go: () => setStepsOpen(true) }
    return null
  })()
  const needsReview = pos.phase === 'program' && pos.cycle > (flags.reviewDone[person] ?? 1)
  const backupDue = (sessions?.length ?? 0) >= 3 && Date.now() - Math.max(flags.lastBackup, flags.backupNudge) > 7 * 86400000

  return (
    <motion.div variants={stagger} initial="hidden" animate="show">
      <motion.div variants={item}>
        <div className="text-[13px] text-mute num flex items-center gap-2"><Clock size={13} /> {istLong(d)} · {istClock(d)} IST</div>
        <h1 className="display text-[32px] leading-tight font-semibold mt-1">{greeting(mins)}, <span className="accent-grad-text">{NAME[person]}</span></h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Chip tone="accent">{positionLabel}</Chip>
          <Chip><Flame size={13} className="accent-text" /> <Ticker value={stk} /> streak</Chip>
        </div>
      </motion.div>

      {needsReview && <motion.div variants={item}><Card className="mt-4 border-a1/50" onClick={() => open({ type: 'review' })}><div className="flex items-center gap-3"><Sparkles className="accent-text" /><div className="flex-1"><div className="font-semibold">12 weeks done — your Program Review is ready</div><div className="text-[13px] text-mute">See your trends, then start Cycle {pos.cycle}.</div></div><ArrowRight size={18} /></div></Card></motion.div>}

      {pos.phase === 'program' && pos.weekday === 'sun' && <motion.div variants={item}><Card className="mt-4 border-a1/50" onClick={() => open({ type: 'insights' })} data-testid="week-review"><div className="flex items-center gap-3"><Sparkles className="accent-text" /><div className="flex-1"><div className="font-semibold">Your week in review</div><div className="text-[13px] text-mute">How the week went and the one thing to change next week.</div></div><ArrowRight size={18} className="text-mute" /></div></Card></motion.div>}

      {nextAction && <motion.div variants={item}><Card className="mt-4 border-a1/50" data-testid="next-action">
        <div className="text-[12px] uppercase tracking-widest accent-text font-semibold">Do next</div>
        <div className="flex items-center gap-3 mt-1"><div className="flex-1 min-w-0"><div className="display text-[20px] font-semibold">{nextAction.title}</div><div className="text-[13px] text-mute">{nextAction.sub}</div></div><Btn onClick={nextAction.go}>{nextAction.cta}</Btn></div>
      </Card></motion.div>}

      {/* Hero workout */}
      <motion.div variants={item} className="mt-4">
        {sessions === undefined ? <div className="skeleton h-56" /> : active ? (
          <Card className="accent-ring" onClick={() => open({ type: 'session' })}>
            <div className="text-[12px] uppercase tracking-widest accent-text font-semibold">In progress</div>
            <div className="display text-[26px] font-semibold mt-1">{active.title}</div>
            <div className="text-[14px] text-mute">Started {new Date(active.startedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · your sets are saved as you go</div>
            <Btn className="w-full mt-4"><Play size={18} /> Resume session</Btn>
          </Card>
        ) : plan.kind === 'before' || plan.kind === 'gap' ? (
          <Card>
            <div className="text-[12px] uppercase tracking-widest accent-text font-semibold">{plan.kind === 'before' ? `${plan.days} day${plan.days === 1 ? '' : 's'} to go` : 'Rest up'}</div>
            <div className="display text-[26px] font-semibold mt-1">{plan.kind === 'before' ? 'Day 0 — Orientation' : 'Week 1 starts tomorrow'}</div>
            <p className="text-[14px] text-mute mt-1">{plan.kind === 'before' ? `Your first visit is ${fmtDate(settings.programStart, { weekday: 'long', day: 'numeric', month: 'long' })}: baseline, a gym tour and easy starting weights.` : 'Eat well, sleep well, pack your bag.'}</p>
            <div className="flex gap-2 mt-4">
              <Btn kind="soft" className="flex-1" onClick={() => setTab('plan')}>Look at the plan</Btn>
              {plan.kind === 'before' && <Btn className="flex-1" onClick={() => begin('sun', true)}>Start Day 0 early</Btn>}
            </div>
          </Card>
        ) : res!.def.kind === 'rest' ? (
          <Card><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-a1/15 accent-text grid place-items-center"><Moon /></div><div><div className="display text-[24px] font-semibold">{slot?.off ? 'Day off' : 'Rest day'}</div><div className="text-[14px] text-mute">{slot?.off ? 'Your weekly day off. Eat well, sleep well. Your next session is already lined up.' : res!.def.note}</div></div></div>
            <Btn kind="soft" className="w-full mt-4" onClick={() => setPick(true)}><Shuffle size={16} /> Do a session anyway</Btn></Card>
        ) : (
          <Card className="accent-ring overflow-hidden relative">
            <div className="absolute right-2 top-3 opacity-95 pointer-events-none">{muscles && <BodyMap both primary={muscles.primary} secondary={muscles.secondary} height={128} />}</div>
            <div className="relative max-w-[66%]">
              <div className="text-[12px] uppercase tracking-widest accent-text font-semibold">{thisDone ? 'Done today' : res!.def.kind === 'active' ? 'Optional' : 'Today'}</div>
              <div className="display text-[28px] leading-tight font-semibold mt-1">{res!.def.title}</div>
              {res!.def.subtitle && <div className="text-[14px] text-mute">{res!.def.subtitle}</div>}
              <div className="flex gap-2 mt-3 flex-wrap"><Chip><Clock size={13} /> ≈ {res!.def.minutes} min</Chip>{res!.steps.length > 0 && <Chip><Dumbbell size={13} /> {res!.steps.length} moves</Chip>}</div>
            </div>
            {res!.def.note && <p className="relative text-[13px] text-mute mt-3">{res!.def.note}</p>}
            {!thisDone && skippedToday ? (
              <div className="relative mt-4 rounded-2xl bg-s2 border border-line/60 p-3" data-testid="skipped-card">
                <div className="flex items-center gap-2 text-[14px] font-semibold"><CalendarOff size={16} /> Not going today · {day.skip?.reason}</div>
                <p className="text-[13px] text-mute mt-1">Your streak is safe and the gym reminder is paused. Meals and water carry on.</p>
                {sched && <p className="text-[12px] text-mute mt-1" data-testid="moved-line">Moved: {describeMoves(person, sched, pos.date)}</p>}
                <div className="flex gap-2 mt-3">
                  <Btn className="flex-1" onClick={() => { void patchDay(person, pos.date, (x) => { delete x.skip }).then(() => syncReminders().catch(() => undefined)); begin(epos.weekday, plan.kind === 'day0') }}><Play size={18} /> Start anyway</Btn>
                  <Btn kind="soft" onClick={() => { void patchDay(person, pos.date, (x) => { delete x.skip }).then(() => syncReminders().catch(() => undefined)); say('Back on for today') }}>Undo</Btn>
                </div>
              </div>
            ) : (<>
              <div className="relative flex gap-2 mt-4">
                {thisDone
                  ? <div className="flex-1 min-h-[48px] rounded-2xl bg-ok/15 text-ok border border-ok/30 font-semibold grid place-items-center"><span className="inline-flex items-center gap-2"><Check size={18} /> Logged{doneToday?.volume ? ` · ${doneToday.volume.toLocaleString('en-IN')} kg` : ''}</span></div>
                  : <Btn className="flex-1" onClick={() => begin(epos.weekday, plan.kind === 'day0')}><Play size={18} /> Start</Btn>}
                {thisDone && doneToday && <Btn kind="soft" label="Edit this workout" onClick={() => setEditId(doneToday.id)}><Pencil size={18} /></Btn>}
                {plan.kind === 'day' && <Btn kind="soft" label="Do a different session" onClick={() => setPick(true)}><Shuffle size={18} /></Btn>}
              </div>
              <div className="relative flex gap-2 mt-2" data-testid="routine-buttons">
                <Btn kind="soft" className="flex-1 !min-h-[44px] text-[14px]" onClick={() => setRoutine('warm')}><Flame size={16} /> Warm-up</Btn>
                <Btn kind="soft" className="flex-1 !min-h-[44px] text-[14px]" onClick={() => setRoutine('cool')}><Wind size={16} /> Cool-down</Btn>
              </div>
              {!thisDone && <button type="button" data-testid="skip-today" onClick={() => setSkipOpen(true)} className="relative w-full mt-2 min-h-[44px] rounded-2xl text-[14px] text-mute inline-flex items-center justify-center gap-2 active:text-ink"><CalendarOff size={15} /> Not going to the gym today</button>}
            </>)}
          </Card>
        )}
      </motion.div>

      {missed && !active && <motion.div variants={item}><Card className="mt-3 border-warn/40">
        <div className="flex items-center gap-3"><AlertTriangle className="text-warn shrink-0" size={20} />
          <div className="flex-1 text-[14px]"><span className="font-semibold">Missed: {WD_LABEL[missed.wd]} {missed.title}</span> — do it today?</div>
          <Btn kind="soft" onClick={() => begin(missed.wd)}>Do it</Btn></div></Card></motion.div>}

      {showCore && <motion.div variants={item}><Card className="mt-3" data-testid="core-card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-a1/15 accent-text grid place-items-center shrink-0"><Flame size={22} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Every day</div>
            <div className="display text-[20px] font-semibold leading-tight">Core &amp; Abs</div>
            <div className="text-[13px] text-mute">5 moves · about 15 min · separate from your lifting</div>
          </div>
          {coreDone ? <Chip tone="ok"><Check size={13} /> Done</Chip>
            : <Btn disabled={!!active && !coreActive} onClick={() => (coreActive ? open({ type: 'session' }) : startCore(person, pos))}><Play size={18} /> {coreActive ? 'Resume' : 'Start'}</Btn>}
        </div>
        {!coreDone && !!active && !coreActive && <p className="text-[12px] text-mute mt-2">Finish your workout first, then do your abs.</p>}
      </Card></motion.div>}

      {cTarget > 0 && <motion.div variants={item}><Card className="mt-3" data-testid="cardio-card">
        <div className="flex items-center gap-3">
          <Ring value={cardioSec / (cTarget * 60)} size={52} stroke={6}><span className="accent-text"><Timer size={18} /></span></Ring>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Daily cardio</div>
            <div className="display text-[20px] font-semibold leading-tight num">{Math.floor(cardioSec / 60)} <span className="text-mute text-[15px] font-medium">of {cTarget} min</span></div>
            <div className="text-[13px] text-mute">{cardioSec >= cTarget * 60 ? 'Target reached' : `${fmtDuration(cTarget * 60 - cardioSec)} to go`}</div>
          </div>
          <Btn kind={cardioSec >= cTarget * 60 ? 'soft' : 'primary'} onClick={() => setCardioOpen(true)}>{cardioSec > 0 ? 'Add' : 'Start'}</Btn>
        </div>
      </Card></motion.div>}

      {/* Rings */}
      <motion.div variants={item} className="grid grid-cols-4 gap-2 mt-4">
        {[
          { l: 'Protein', v: proteinEaten / Math.max(1, menu.t.protein), txt: `${Math.round(proteinEaten)} g`, icon: <Utensils size={16} />, on: () => setTab('diet') },
          { l: 'Water', v: (day.water * GLASS) / WATER_L[person], txt: `${(day.water * GLASS).toFixed(2).replace(/\.?0+$/, '')} L`, icon: <Droplets size={16} />, on: () => { void patchDay(person, pos.date, (x) => { x.water += 1 }); say('+1 glass (250 ml)') } },
          { l: 'Steps', v: day.steps / STEPS[person], txt: day.steps ? `${(day.steps / 1000).toFixed(1)}k` : 'Log', icon: <Footprints size={16} />, on: () => setStepsOpen(true) },
          { l: 'Workout', v: thisDone || doneToday ? 1 : active ? 0.5 : 0, txt: thisDone || doneToday ? 'Done' : active ? 'Going' : skippedToday ? 'Skipped' : slot?.off ? 'Day off' : res && res.def.kind === 'rest' ? 'Rest' : 'Not yet', icon: <Dumbbell size={16} />, on: () => active && open({ type: 'session' }) },
        ].map((r) => (
          <button key={r.l} type="button" onClick={r.on} aria-label={`${r.l}: ${r.txt}`} className="card p-2.5 flex flex-col items-center gap-1 active:scale-[0.97] transition-transform">
            <Ring value={r.v} size={58} stroke={6}><span className="accent-text">{r.icon}</span></Ring>
            <div className="text-[13px] font-semibold num">{r.txt}</div><div className="text-[11px] text-mute -mt-1">{r.l}</div>
          </button>))}
      </motion.div>

      {/* Next meal */}
      {next && nextOpt && <motion.div variants={item}><Card className="mt-3" onClick={() => setTab('diet')}>
        <div className="flex items-center justify-between"><div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Next meal · {next.s.label}</div>
          <Chip tone={until <= 0 ? 'accent' : 'default'}>{until <= 0 ? 'Now' : until < 60 ? `in ${until} min` : `in ${Math.floor(until / 60)} h ${until % 60} min`}</Chip></div>
        <div className="font-medium mt-2 text-[15px]">{mealName(nextOpt, menu.scaled.qty[next.s.id])}</div>
        <div className="text-[13px] text-mute num mt-0.5">{fmtMin(next.at)} · ≈ {menu.scaled.kcal[next.s.id]} kcal · ≈ {menu.scaled.protein[next.s.id]} g protein</div>
      </Card></motion.div>}

      {/* Quick weigh-in */}
      {!weightHidden && <motion.div variants={item}><Card className="mt-3" id="weigh-card">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Quick weigh-in</div><div className="text-[12px] text-mute">Morning, after the toilet, before food</div></div>
          {todayW && <Chip tone="ok"><Check size={13} /> {todayW.kg} kg</Chip>}
        </div>
        <div className="flex items-center justify-between mt-2">
          <Stepper value={kg} onChange={setKg} step={0.1} min={30} max={200} unit="kg" label="Body weight" big />
          <Btn kind={todayW ? 'soft' : 'primary'} onClick={async () => { await setWeight(person, pos.date, kg); set((s) => { s.profiles[person].weightKg = kg }); say('Weight saved') }}>{todayW ? 'Update' : 'Save'}</Btn>
        </div>
      </Card></motion.div>}

      {profile.adjustReason && <motion.div variants={item}><Card className="mt-3"><div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Calories check-in</div><p className="text-[14px] mt-1">{profile.adjustReason}</p></Card></motion.div>}

      {backupDue && <motion.div variants={item}><Card className="mt-3"><div className="text-[14px]"><span className="font-semibold">Back up your logs.</span> iPhones can clear app storage. A weekly backup takes ten seconds.</div>
        <div className="flex gap-2 mt-3"><Btn className="flex-1" onClick={() => void downloadBackup()}>Back up now</Btn><Btn kind="soft" onClick={() => set((s) => { s.flags.backupNudge = Date.now() })}>Later</Btn></div></Card></motion.div>}

      <Section title="Together"><Together /></Section>

      <SessionEditor id={editId} onClose={() => setEditId(null)} />
      <RoutineSheet open={!!routine} initial={lastRoutine.current} dayKind={res?.def.kind ?? 'full'} onClose={() => setRoutine(null)} />
      <Sheet open={skipOpen} onClose={() => { setSkipOpen(false); setOffAsk(null) }} title={offAsk ? `Will you work out on ${offDay ? FULL_DAY[offDay] : 'your day off'}?` : 'Not going to the gym today?'}>
        {offAsk && offDay ? (() => {
          const pv = previewSkip(person, pos.date, offDay, skipMap)
          return (
            <div data-testid="off-ask">
              <p className="text-[14px] text-mute mb-3">Today’s session moves to tomorrow, and everything after it moves one day later. {FULL_DAY[offDay]} is your day off, so it’s your call whether to use it.</p>
              <div className="space-y-2">
                <button type="button" data-testid="off-yes" onClick={() => doSkip(offAsk, true)} className="w-full min-h-[64px] px-4 py-2 rounded-2xl bg-s2 border border-line/60 text-left active:scale-[0.99]">
                  <span className="font-medium block">Yes, train on {FULL_DAY[offDay]}</span><span className="text-[12px] text-mute">{describeMoves(person, pv.yes, pos.date)}</span></button>
                <button type="button" data-testid="off-no" onClick={() => doSkip(offAsk, false)} className="w-full min-h-[64px] px-4 py-2 rounded-2xl bg-s2 border border-line/60 text-left active:scale-[0.99]">
                  <span className="font-medium block">No, keep {FULL_DAY[offDay]} off</span><span className="text-[12px] text-mute">{describeMoves(person, pv.no, pos.date)}</span></button>
              </div>
            </div>)
        })() : (<>
          <p className="text-[14px] text-mute mb-3">Pick a reason. Your streak stays safe, today won’t count as a miss, the gym reminder is paused, and today’s session moves to the next day.</p>
          <div className="space-y-2" data-testid="skip-reasons">
            {['Travelling', 'Not feeling well', 'Injury or sore', 'Busy day', 'Just resting'].map((r) => (
              <button key={r} type="button" onClick={() => { if (previewSkip(person, pos.date, offDay, skipMap).asksOff) setOffAsk(r); else doSkip(r) }}
                className="w-full min-h-[52px] px-4 rounded-2xl bg-s2 border border-line/60 text-left font-medium active:scale-[0.99]">{r}</button>))}
          </div>
        </>)}
      </Sheet>
      <Sheet open={pick} onClose={() => setPick(false)} title="Do a different session">
        <p className="text-[14px] text-mute mb-3">Pick any session from this week. The app records which one you did.</p>
        <div className="space-y-2">{WEEKDAYS.map((wd) => {
          const def = PROGRAMS[person].days[wd]
          if (def.kind === 'rest') return null
          const done = doneKeys.has(wd)
          return (
            <button key={wd} type="button" onClick={() => { setPick(false); begin(wd) }} className="w-full min-h-[60px] px-4 rounded-2xl bg-s2 border border-line/60 flex items-center gap-3 text-left">
              <span className="w-10 text-[13px] text-mute">{WD_LABEL[wd]}</span>
              <span className="flex-1"><span className="font-medium block">{def.title}</span><span className="text-[12px] text-mute">{def.subtitle ?? `≈ ${def.minutes} min`}</span></span>
              {done ? <Chip tone="ok"><Check size={13} /> Done</Chip> : wd === pos.weekday ? <Chip tone="accent">Today</Chip> : null}
            </button>)
        })}</div>
      </Sheet>
      <Sheet open={cardioOpen} onClose={() => setCardioOpen(false)} title="Daily cardio">
        <p className="text-[14px] text-mute">Time it live, or add what you already did. Target: {cTarget} min a day.</p>
        <div className="flex gap-2 mt-3" role="radiogroup" aria-label="Machine">
          {['incline-walk', 'bike', 'elliptical'].map((e) => <button key={e} type="button" role="radio" aria-checked={cardioEx === e} onClick={() => setCardioEx(e)}
            className={cx('flex-1 min-h-[44px] rounded-full border text-[13px] font-semibold px-2', cardioEx === e ? 'accent-grad text-[#08080c] border-transparent' : 'bg-s2 border-line/60 text-ink')}>{e === 'incline-walk' ? 'Treadmill' : exName(e).replace('Stationary ', '')}</button>)}
        </div>
        <div className="flex gap-2 mt-3" data-testid="cardio-quick">
          {[10, 15, 30].map((m) => <Btn key={m} kind="soft" className="flex-1" onClick={() => addCardio(m)}>+{m} min</Btn>)}
        </div>
        <CardioTimer ex={cardioEx} />
        <Btn className="w-full mt-4" onClick={() => setCardioOpen(false)}>Done</Btn>
      </Sheet>
      <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} title="Steps today">
        <p className="text-[14px] text-mute mb-3">Type the number from your phone’s Health app. Target: {person === 'vikas' ? '7–8k' : '9–10k'} a day.</p>
        <div className="flex justify-center"><Stepper value={day.steps} onChange={(v) => void patchDay(person, pos.date, (x) => { x.steps = v })} step={500} max={60000} unit="steps" label="Steps" big /></div>
        <Btn className="w-full mt-5" onClick={() => setStepsOpen(false)}>Done</Btn>
      </Sheet>
    </motion.div>
  )
}

function Together() {
  const me = usePerson()
  const pos = usePosition()
  const profiles = useStore((s) => s.profiles)
  const actives = useStore((s) => s.active)
  const avatars = useStore((s) => s.avatars)
  const { setPerson, open } = useStore.getState()
  const todays = useLive(async () => (await db.sessions.where('date').equals(pos.date).toArray()).filter((s) => s.key !== 'core'), [pos.date], [])
  const weekStart = addDays(pos.date, -WEEKDAYS.indexOf(pos.weekday))
  const weekSessions = useLive(async () => (await db.sessions.where('date').between(weekStart, pos.date, true, true).toArray()).filter((s) => s.key !== 'core'), [weekStart, pos.date], [])
  const bothDays = (() => {
    const by: Record<string, Set<string>> = {}
    for (const x of weekSessions) if (x.finishedAt) (by[x.date] ??= new Set()).add(x.person)
    return Object.values(by).filter((set) => set.size >= PEOPLE.length).length
  })()
  return (
    <div>
      {bothDays > 0 && <div className="mb-2" data-testid="both-trained"><Chip tone="ok"><Dumbbell size={13} /> Both trained {bothDays === 1 ? 'together on 1 day' : `on ${bothDays} days`} this week</Chip></div>}
      <div className="grid grid-cols-2 gap-2">
        {PEOPLE.map((p) => {
          const pl = profiles[p].onboarded ? todayPlan(p, pos, profiles[p]) : null
          const title = !pl ? 'Not set up yet' : pl.kind === 'day' || pl.kind === 'day0' ? pl.res.def.title : pl.kind === 'before' ? 'Starting soon' : 'Rest'
          const done = todays.some((s) => s.person === p && s.finishedAt)
          const status = done ? 'Done ✓' : actives[p] ? 'In progress' : pl && (pl.kind === 'day' || pl.kind === 'day0') && pl.res.def.kind !== 'rest' ? 'Not yet' : '—'
          return (
            <button key={p} type="button" onClick={() => (profiles[p].onboarded ? setPerson(p) : open({ type: 'profile', person: p }))} className={cx('card p-3 text-left', p === me && 'border-a1/50')}
              style={{ ['--a1c' as string]: p === 'vikas' ? '#4c8dff' : '#ff6b9a', ['--a2c' as string]: p === 'vikas' ? '#22d3ee' : '#c77dff' }}>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl accent-grad grid place-items-center overflow-hidden text-[#08080c] display font-bold">{avatars[p] ? <img src={avatars[p]} alt="" className="w-full h-full object-cover" /> : NAME[p][0]}</span>
                <span className="font-semibold">{NAME[p]}</span>
              </div>
              <div className="text-[13px] mt-2 truncate">{title}</div>
              <div className={cx('text-[12px]', done ? 'text-ok' : 'text-mute')}>{status}</div>
            </button>)
        })}
      </div>
      <p className="text-[12px] text-mute mt-2 px-1">Both phones read the same shared data, so this is live for {NAME[otherPerson(me)]} too. Tap a card to view that person.</p>
    </div>
  )
}
