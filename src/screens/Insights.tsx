import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Download, Dumbbell, Flame, Footprints, Utensils } from 'lucide-react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore, usePerson } from '../store'
import { NAME, PEOPLE, type Person } from '../types'
import { db, useLive, type DayRow, type WeightRow } from '../db'
import { usePosition } from '../lib/hooks'
import { addDays, fmtDate, istDate } from '../engine/calendar'
import { cardioTotals, fmtDuration } from '../lib/cardio'
import { targets, stepsTarget } from '../engine/nutrition'
import { balanceTone, dayStats, narrate, rangeDates, summarize, type DayStat, type Summary } from '../lib/insights'
import { Btn, Card, Section, Segmented, Sheet, Skeletons, cx } from '../components/ui'
import { buildInsightsPdf } from '../lib/insightsPdf'
import { saveBlob } from '../lib/share'
import { buildWorkoutPdf } from '../lib/workoutPdf'
import { buildReport } from '../lib/workoutReport'
import { gymDayFn, offDayOf } from '../engine/schedule'
import { useSkipMap } from '../lib/hooks'
import type { SessionLog } from '../types'
import { exName } from '../data/exercises'
import { deloadAdvice, stalledLifts } from '../lib/plateau'
import { weeklyReview } from '../lib/weekly'

type Range = '7' | '30' | '90'
const PDF_DAYS = [7, 14, 30, 60, 90, 180]
const tip = { background: 'rgb(var(--s2))', border: '1px solid rgb(var(--line))', borderRadius: 12, fontSize: 12 }
const axis = { fill: 'rgb(var(--mute))', fontSize: 11 }

function usePersonData(person: Person) {
  const days = useLive<DayRow[] | undefined>(() => db.days.where('person').equals(person).toArray(), [person], undefined)
  const sessions = useLive<SessionLog[] | undefined>(async () => (await db.sessions.where('person').equals(person).toArray()).filter((s) => s.key !== 'core'), [person], undefined)
  const weights = useLive<WeightRow[] | undefined>(() => db.weights.where('person').equals(person).toArray(), [person], undefined)
  return { days, sessions, weights }
}

function Tile({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'good' | 'warn' }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-widest text-mute font-semibold"><span className="accent-text">{icon}</span>{label}</div>
      <div className={cx('display text-[26px] font-semibold num mt-1', tone === 'good' && 'text-ok', tone === 'warn' && 'text-warn')}>{value}</div>
      {sub && <div className="text-[12px] text-mute">{sub}</div>}
    </div>
  )
}

function useStats(person: Person, n: number) {
  const pos = usePosition()
  const profile = useStore((s) => s.profiles[person])
  const settings = useStore((s) => s.settings)
  useStore((s) => s.contentRev)
  const { days, sessions, weights } = usePersonData(person)
  return useMemo(() => {
    if (!days || !sessions || !weights) return null
    const stats = dayStats(person, rangeDates(pos.date, n), days, sessions, weights, profile, settings)
    return { stats, sum: summarize(stats), target: targets(person, profile) }
  }, [days, sessions, weights, person, n, pos.date, profile, settings, useStore.getState().contentRev]) // eslint-disable-line
}

export function Insights() {
  const me = usePerson()
  const s = useStore()
  const [who, setWho] = useState<Person>(me)
  const [range, setRange] = useState<Range>('7')
  const n = Number(range)
  const [dlOpen, setDlOpen] = useState(false)
  const [dlDays, setDlDays] = useState('30')
  const [dlBusy, setDlBusy] = useState(false)
  const [dlKind, setDlKind] = useState<'workout' | 'health'>('workout')
  const skipMap = useSkipMap(who)
  const [dlErr, setDlErr] = useState('')
  const a = useStats(who, n)
  const other = PEOPLE.find((p) => p !== who)!
  const b = useStats(other, n)
  const profile = s.profiles[who]
  const w7 = useStats(who, 7)
  const pdata = usePersonData(who)
  const todayStr = usePosition().date
  const stalled = useMemo(() => (pdata.sessions ? stalledLifts(pdata.sessions, todayStr) : []), [pdata.sessions, todayStr])
  const cardio7 = useMemo(() => { const t = istDate(); return cardioTotals(pdata.sessions ?? [], pdata.days ?? [], addDays(t, -6), t) }, [pdata.sessions, pdata.days])
  const review = useMemo(() => (w7 && pdata.weights ? weeklyReview(who, w7.stats, w7.sum, w7.target, pdata.weights, stalled, (pdata.days ?? []).filter((d) => d.skip && d.date >= addDays(istDate(), -6) && d.date <= istDate()).length) : null), [w7, pdata.weights, pdata.days, stalled, who])
  const advice = useMemo(() => deloadAdvice(stalled), [stalled])
  const dlN = Math.min(365, Math.max(1, Math.floor(Number(dlDays)) || 0))
  const dlValid = Number.isFinite(Number(dlDays)) && Number(dlDays) >= 1 && Number(dlDays) <= 365
  const download = async () => {
    if (!pdata.days || !pdata.sessions || !pdata.weights || !dlValid) return
    setDlBusy(true); setDlErr('')
    try {
      if (dlKind === 'workout') {
        const t = istDate(), from = addDays(t, -(dlN - 1))
        const wSorted = [...pdata.weights].sort((x, y) => x.date.localeCompare(y.date))
        const kgOn = (date: string) => { let kg = profile.weightKg; for (const w of wSorted) { if (w.date <= date) kg = w.kg; else break } return kg }
        const isGym = gymDayFn(who, offDayOf(who, profile), skipMap)
        let planned = 0
        for (let d = from; d <= t; d = addDays(d, 1)) if (d >= s.settings.programStart && isGym(d)) planned++
        const report = buildReport({ person: who, sessions: pdata.sessions, days: pdata.days, from, to: t, kgOn, planned })
        const blob = await buildWorkoutPdf({ name: NAME[who], goal: who === 'vikas' ? 'Lean bulk' : 'Fat loss and strength', report, generated: fmtDate(t, { day: 'numeric', month: 'short', year: 'numeric' }) })
        await saveBlob(blob, `V2Fit-Workouts-${NAME[who]}-${t}-${dlN}d.pdf`)
        setDlOpen(false); return
      }
      const t = istDate(), stats = dayStats(who, rangeDates(t, dlN), pdata.days, pdata.sessions, pdata.weights, profile, s.settings)
      const sum = summarize(stats), tg = targets(who, profile), first = stats[0].date
      const blob = await buildInsightsPdf({
        name: NAME[who], goal: who === 'vikas' ? 'Lean bulk' : 'Fat loss and strength', stats, sum, target: tg, stepsGoal: stepsTarget(who, profile),
        notes: narrate(who, stats, sum, tg, stepsTarget(who, profile)), weights: pdata.weights.filter((w) => w.date >= first && w.date <= t).map((w) => ({ date: w.date, kg: w.kg })),
        generated: fmtDate(t, { day: 'numeric', month: 'short', year: 'numeric' }),
      })
      await saveBlob(blob, `V2Fit-Insights-${NAME[who]}-${t}-${dlN}d.pdf`)
      setDlOpen(false)
    } catch (e) { setDlErr('Could not make the PDF. Try again.'); console.error(e) } finally { setDlBusy(false) }
  }
  const notes = useMemo(() => (a ? narrate(who, a.stats, a.sum, a.target, stepsTarget(who, profile)) : []), [a, who, profile])
  const chart = useMemo(() => (a?.stats ?? []).map((d: DayStat) => ({ date: d.date, eaten: d.eaten || null, burn: d.logged ? d.burn : null, workout: d.workoutBurn + d.stepBurn })), [a])
  const weekly = useMemo(() => {
    const out: { label: string; workouts: number; minutes: number }[] = []
    for (let i = 0; i < (a?.stats.length ?? 0); i += 7) {
      const w = a!.stats.slice(i, i + 7)
      out.push({ label: fmtDate(w[0].date, { day: 'numeric', month: 'short' }), workouts: w.reduce((x, d) => x + d.sessions, 0), minutes: w.reduce((x, d) => x + d.minutes, 0) })
    }
    return out
  }, [a])

  return (
    <motion.div className="fixed inset-0 z-50 bg-bg flex flex-col h-dvh-full" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
      <div className="max-w-[520px] w-full mx-auto flex flex-col h-full">
        <div className="safe-t shrink-0 flex items-center gap-2 px-3 py-2">
          <button type="button" aria-label="Back" onClick={() => s.open(null)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><ArrowLeft size={20} /></button>
          <h1 className="display font-semibold text-[22px] flex-1">Insights</h1>
          <button type="button" aria-label="Download as PDF" data-testid="insights-pdf" onClick={() => setDlOpen(true)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><Download size={19} /></button>
        </div>
        <div className="px-4 pb-2 flex items-center justify-between gap-2">
          <Segmented id="ins-who" small value={who} onChange={setWho} options={PEOPLE.map((p) => ({ value: p, label: NAME[p] }))} />
          <Segmented id="ins-range" small value={range} onChange={setRange} options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }]} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-10 no-scrollbar" id="insights-scroll">
          {!a ? <Skeletons n={4} /> : (
            <>
              {a.sum.daysLogged === 0 && <Card className="mt-2"><p className="text-[14px] text-mute">Nothing logged in the last {n} days for {NAME[who]} yet. Tick meals, add water and steps, and finish a workout — this fills in by itself.</p></Card>}
              {review && w7 && w7.sum.daysLogged > 0 && <Card className="mt-2 border-a1/40" data-testid="week-card">
                <div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Your week · last 7 days</div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <div><div className="display text-[24px] font-semibold num">{review.workouts}<span className="text-mute text-[15px]"> / {review.planned}</span></div><div className="text-[12px] text-mute">workouts</div></div>
                  <div><div className="display text-[24px] font-semibold num">{review.proteinDays}<span className="text-mute text-[15px]"> / {review.eatDays || 0}</span></div><div className="text-[12px] text-mute">protein days</div></div>
                  <div><div className="display text-[24px] font-semibold num">{review.weightDelta == null ? '—' : `${review.weightDelta > 0 ? '+' : ''}${review.weightDelta}`}</div><div className="text-[12px] text-mute">kg this week</div></div>
                </div>
                {cardio7.seconds > 0 && <div className="mt-2 text-center text-[13px] text-mute" data-testid="cardio-week">Cardio timed: <span className="text-ink font-semibold">{fmtDuration(cardio7.seconds)}</span></div>}
                <div className="mt-3 rounded-2xl bg-s2 p-3"><div className="text-[12px] uppercase tracking-widest accent-text font-semibold">Next week, one thing</div><p className="text-[14px] mt-1">{review.focus}</p></div>
              </Card>}
              {stalled.length > 0 && <Card className="mt-3" data-testid="stalled">
                <div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Lifts that have stalled</div>
                <ul className="mt-2 space-y-1.5">{stalled.slice(0, 6).map((x) => <li key={x.ex} className="flex items-baseline justify-between gap-3 text-[14px]"><span className="min-w-0 truncate">{exName(x.ex)}</span><span className="text-mute num text-[12px] shrink-0">best {x.w ? `${x.w} kg × ` : ''}{x.reps}, {Math.round(x.daysSinceBest / 7)} wk ago</span></li>)}</ul>
                <p className="text-[13px] text-mute mt-2.5">{advice.text}</p>
              </Card>}
              {notes.length > 0 && <Card className="mt-2" data-testid="summary">
                <div className="text-[12px] uppercase tracking-widest text-mute font-semibold">Last {n} days, in plain words</div>
                <ul className="mt-2 space-y-2">{notes.map((x) => <li key={x.text} className="flex gap-2 text-[14px]"><span aria-hidden className={cx('mt-[7px] w-2 h-2 rounded-full shrink-0', x.tone === 'good' ? 'bg-ok' : x.tone === 'warn' ? 'bg-warn' : 'bg-mute')} /><span><span className="sr-only">{x.tone === 'good' ? 'Good: ' : x.tone === 'warn' ? 'Needs attention: ' : ''}</span>{x.text}</span></li>)}</ul>
              </Card>}
              <div className="grid grid-cols-2 gap-3 mt-3" data-testid="insight-tiles">
                <Tile icon={<Utensils size={14} />} label="Eaten / day" value={a.sum.avgEaten ? `${a.sum.avgEaten.toLocaleString('en-IN')}` : '—'} sub={`target ${a.target.kcal.toLocaleString('en-IN')} kcal`} />
                <Tile icon={<Flame size={14} />} label="Burnt / day" value={a.sum.avgBurn ? a.sum.avgBurn.toLocaleString('en-IN') : '—'} sub="estimate, kcal" />
                <Tile icon={<Dumbbell size={14} />} label="Workouts" value={String(a.sum.workouts)} sub={`${a.sum.minutes} min · ${a.sum.volume.toLocaleString('en-IN')} kg lifted`} />
                <Tile icon={<Footprints size={14} />} label="Steps / day" value={a.sum.avgSteps ? a.sum.avgSteps.toLocaleString('en-IN') : '—'} sub={`target ${stepsTarget(who, profile).toLocaleString('en-IN')}`} tone={a.sum.avgSteps >= stepsTarget(who, profile) ? 'good' : undefined} />
              </div>
              <Card className="mt-3">
                <div className="flex items-center justify-between"><span className="text-[13px] text-mute">Daily balance (eaten − burnt)</span><span className={cx('num font-semibold whitespace-nowrap', balanceTone(who, a.sum.net) === 'good' && 'text-ok', balanceTone(who, a.sum.net) === 'warn' && 'text-warn')} data-testid="net">{a.sum.net == null ? '—' : `${a.sum.net > 0 ? '+' : ''}${a.sum.net} kcal`}</span></div>
                <div className="flex items-center justify-between mt-1"><span className="text-[13px] text-mute">Protein / day</span><span className="num font-semibold">{a.sum.avgProtein ? `${a.sum.avgProtein} g` : '—'} <span className="text-mute font-normal">of {a.target.protein} g</span></span></div>
                <div className="flex items-center justify-between mt-1"><span className="text-[13px] text-mute">Water / day</span><span className="num font-semibold">{a.sum.avgWater ? `${a.sum.avgWater} L` : '—'}</span></div>
              </Card>

              <Section title="Calories: eaten vs burnt">
                <Card className="!p-2">
                  <div className="h-[220px]" role="img" aria-label="Daily calories eaten and burnt">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 5" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, { day: 'numeric', month: 'short' })} tick={axis} axisLine={false} tickLine={false} minTickGap={24} />
                        <YAxis tick={axis} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={tip} labelFormatter={(d) => fmtDate(String(d))} formatter={(v, nme) => [`${v} kcal`, nme === 'eaten' ? 'Eaten' : 'Burnt (est.)']} />
                        <Bar dataKey="eaten" fill="var(--a1c)" radius={[6, 6, 0, 0]} isAnimationActive={false}>{chart.map((d) => <Cell key={d.date} fill={d.eaten && (who === 'vikas' ? d.eaten >= a.target.kcal * 0.92 : d.eaten <= a.target.kcal * 1.08) ? 'var(--a1c)' : 'rgb(var(--warn))'} />)}</Bar>
                        <ReferenceLine y={a.target.kcal} stroke="rgb(var(--mute))" strokeDasharray="4 4" />
                        <Line dataKey="burn" stroke="var(--a2c)" strokeWidth={3} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 justify-center text-[12px] text-mute pb-1"><span><i className="inline-block w-3 h-3 rounded-sm mr-1 align-[-1px]" style={{ background: 'var(--a1c)' }} />Eaten</span><span><i className="inline-block w-3 h-[3px] mr-1 align-middle" style={{ background: 'var(--a2c)' }} />Burnt (est.)</span><span><i className="inline-block w-3 h-3 rounded-sm mr-1 align-[-1px] bg-warn" />Off target</span><span>┈ Target</span></div>
                </Card>
                <p className="text-[12px] text-mute mt-2">Eaten = meals you ticked off, at your scaled portions. Balance only counts days with food logged. Burnt = resting + daily living (BMR × 1.2) + steps + logged workouts. These are estimates for spotting trends, not exact numbers.</p>
              </Section>

              <Section title="Workouts per week">
                <Card className="!p-2">
                  <div className="h-[160px]" role="img" aria-label="Workouts per week">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={weekly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid stroke="rgb(var(--line))" strokeDasharray="3 5" vertical={false} />
                        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={40} />
                        <Tooltip contentStyle={tip} formatter={(v, nme) => [nme === 'workouts' ? `${v} sessions` : `${v} min`, nme === 'workouts' ? 'Workouts' : 'Time']} />
                        <Bar dataKey="workouts" fill="var(--a1c)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </Section>

              {b && (
                <Section title="Side by side">
                  <Card>
                    <table className="w-full text-[14px]" data-testid="compare">
                      <thead><tr className="text-mute text-[12px] uppercase tracking-widest"><th className="text-left font-semibold pb-2"> </th><th className="text-right font-semibold pb-2">{NAME[who]}</th><th className="text-right font-semibold pb-2">{NAME[other]}</th></tr></thead>
                      <tbody className="num">
                        {rows(a.sum, b.sum).map(([l, x, y]) => <tr key={l} className="border-t border-line/50"><td className="py-2 text-mute">{l}</td><td className="py-2 text-right font-semibold">{x}</td><td className="py-2 text-right font-semibold">{y}</td></tr>)}
                      </tbody>
                    </table>
                  </Card>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
      <Sheet open={dlOpen} onClose={() => setDlOpen(false)} title="Download as PDF">
        <div className="grid grid-cols-2 gap-2 mb-4" role="radiogroup" aria-label="Report type">
          {([['workout', 'Workout report'], ['health', 'Health insights']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={dlKind === k} onClick={() => setDlKind(k)}
            className={cx('min-h-[44px] rounded-xl border text-[14px] font-semibold', dlKind === k ? 'accent-grad text-[#08080c] border-transparent' : 'bg-s2 border-line/60 text-ink')}>{l}</button>)}
        </div>
        <p className="text-[14px] text-mute">{NAME[who]}'s {dlKind === 'workout' ? 'workouts' : 'insights'} for the last…</p>
        <div className="flex flex-wrap gap-2 mt-3" role="radiogroup" aria-label="Number of days">
          {PDF_DAYS.map((d) => <button key={d} type="button" role="radio" aria-checked={dlDays === String(d)} onClick={() => setDlDays(String(d))}
            className={cx('min-h-[44px] px-4 rounded-full border text-[14px] font-semibold', dlDays === String(d) ? 'accent-grad text-[#08080c] border-transparent' : 'bg-s2 border-line/60 text-ink')}>{d} days</button>)}
        </div>
        <label className="flex items-center gap-3 mt-4 text-[14px]">
          <span className="text-mute">Or a number of days</span>
          <input aria-label="Custom number of days" data-testid="pdf-days" inputMode="numeric" value={dlDays} onChange={(e) => setDlDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className="w-20 min-h-[44px] rounded-xl bg-s2 border border-line/60 text-center display font-semibold text-[18px] outline-none" />
        </label>
        <p className="text-[12px] text-mute mt-2">1 to 365 days, counting back from today.{!dlValid && dlDays !== '' ? ' Enter a number between 1 and 365.' : ''}</p>
        <p className="text-[12px] text-mute mt-1">{dlKind === 'workout' ? 'Workouts only: muscle body maps, sets and counts per muscle, load charts, top lifts, and a card for each workout. Up to 5 pages, no food data.' : 'Includes the summary, plain-words notes, calorie chart, week by week table, weight and a day-by-day log.'}</p>
        {dlErr && <p role="alert" className="text-[13px] text-warn mt-2">{dlErr}</p>}
        <Btn className="w-full mt-4" disabled={dlBusy || !dlValid || !pdata.days} onClick={download}><Download size={18} /> {dlBusy ? 'Making PDF…' : `Download ${dlValid ? dlN : ''}-day ${dlKind === 'workout' ? 'workout report' : 'PDF'}`}</Btn>
      </Sheet>
    </motion.div>
  )
}

const f = (n: number, unit = '') => (n ? `${n.toLocaleString('en-IN')}${unit}` : '—')
const rows = (a: Summary, b: Summary): [string, string, string][] => [
  ['Days logged', String(a.daysLogged), String(b.daysLogged)],
  ['Eaten / day', f(a.avgEaten), f(b.avgEaten)],
  ['Burnt / day', f(a.avgBurn), f(b.avgBurn)],
  ['Protein / day', f(a.avgProtein, ' g'), f(b.avgProtein, ' g')],
  ['Workouts', String(a.workouts), String(b.workouts)],
  ['Steps / day', f(a.avgSteps), f(b.avgSteps)],
]
