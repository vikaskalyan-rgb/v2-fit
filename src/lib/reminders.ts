import { useStore } from '../store'
import type { Person } from '../types'
import { WEEKDAYS } from '../types'
import { addDays, position } from '../engine/calendar'
import { PLANS, dayMenu, optionById } from '../engine/rotation'
import { fmtMin, mealName, mealTimes, scaleDay, targets, waterTarget } from '../engine/nutrition'
import { PROGRAMS } from '../engine/program'
import { offDayOf, weekPlan, weekStartOf } from '../engine/schedule'
import { db } from '../db'
import { quoteFor } from '../data/quotes'
import { DEFAULT_API, call, getCfg } from './sync'

export interface ReminderItem { date: string; at: number; title: string; body: string; img?: string; slot?: string; tag?: string }
const FLAG = 'v2fit-reminders'
const DAYS_AHEAD = 7

/** The next week of reminders for one person: each meal, a nudge before the gym, and three water prompts. Pure, so it can be tested. */
export function buildItems(person: Person, today: string, st: { programStart: string; mergeDay0: boolean }, profile: Parameters<typeof targets>[1], swapsByDate: Record<string, Record<string, string>> = {}, skipDates: ReadonlySet<string> = new Set(), skipMap: Record<string, { useOff?: boolean }> = {}): ReminderItem[] {
  const out: ReminderItem[] = []
  const plan = PLANS[person]
  const [gh, gm] = profile.gymTime.split(':').map(Number)
  const gymAt = (gh || 7) * 60 + (gm || 0)
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(today, i)
    const pos = position(date, st.programStart, st.mergeDay0)
    if (pos.phase === 'before') continue
    const wIdx = pos.phase === 'program' ? pos.weekInMonth : 1
    const dIdx = pos.phase === 'program' ? WEEKDAYS.indexOf(pos.weekday) : 6
    const base = dayMenu(person, wIdx, dIdx, profile.veg)
    const picks = { ...base, ...(swapsByDate[date] ?? {}) }
    const chosen = plan.slots.map((s) => ({ slot: s.id, option: optionById(plan, picks[s.id]) ?? optionById(plan, base[s.id])! })).filter((c) => !!c.option)
    const sc = scaleDay(chosen, targets(person, profile).kcal)
    const times = mealTimes(plan.slots.map((s) => s.id), profile.gymTime)
    for (const c of chosen) {
      const at = times[c.slot]
      if (at == null) continue
      const label = plan.slots.find((s) => s.id === c.slot)!.label
      out.push({ date, at, title: `${label} at ${fmtMin(at)}`, body: `${mealName(c.option, sc.qty[c.slot])} · ≈ ${sc.kcal[c.slot]} kcal, ${sc.protein[c.slot]} g protein`, img: c.option.id, slot: c.slot })
    }
    const sk: Record<string, { useOff?: boolean }> = { ...Object.fromEntries([...skipDates].map((d) => [d, {}])), ...skipMap }
    const sl = pos.phase === 'program' ? weekPlan(person, weekStartOf(date), offDayOf(person, profile), sk).slots[WEEKDAYS.indexOf(pos.weekday)] : null
    const def = sl ? PROGRAMS[person].days[sl.session] : null
    if (def && sl && !sl.off && def.kind !== 'rest' && def.kind !== 'active' && !skipDates.has(date) && !skipMap[date]) out.push({ date, at: Math.max(0, gymAt - 15), title: 'Gym in 15 minutes', body: def.title })
    const glasses = Math.round(waterTarget(person, profile) / 0.25)
    out.push({ date, at: 15 * 60, title: 'Gym o’clock 💪', body: quoteFor(date) })
    for (let h = 9; h <= 21; h++) if (h !== 15) out.push({ date, at: h * 60, title: 'Drink some water', body: `A glass now (about 250 ml). Aim for ${glasses} today.`, tag: 'water' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
}

export const remindersSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
export const remindersOn = () => { try { return localStorage.getItem(FLAG) === '1' } catch { return false } }
const setFlag = (on: boolean) => { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG) } catch { /* private mode */ } }

const b64 = (s: string) => { const pad = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)) }

/** Upload this phone's subscription and the coming week of reminders. */
export async function syncReminders(): Promise<void> {
  const cfg = getCfg()
  if (!remindersOn() || !cfg) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) { setFlag(false); return }
  const s = useStore.getState()
  const person = (s.me ?? s.person ?? 'vikas') as Person
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
  const rows = (await db.days.where('person').equals(person).toArray()).filter((d) => d.skip)
  const skips = new Set(rows.map((d) => d.date))
  const skipMap = Object.fromEntries(rows.map((d) => [d.date, { useOff: d.skip!.useOff }]))
  const items = buildItems(person, today, s.settings, s.profiles[person], {}, skips, skipMap)
  await call(DEFAULT_API, '/api/push/subscription', { method: 'PUT', token: cfg.token, body: JSON.stringify({ subscription: sub.toJSON(), person, items }) })
}

export async function enableReminders(): Promise<void> {
  const cfg = getCfg()
  if (!cfg) throw new Error('Connect to the shared database first (Data tab).')
  if (!remindersSupported()) throw new Error('This browser can’t show notifications. On iPhone, install the app to your Home Screen first.')
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked. Allow them for V² Fit in your phone’s Settings.')
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await call<{ publicKey: string }>(DEFAULT_API, '/api/push/key')
  if (!(await reg.pushManager.getSubscription())) await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) })
  setFlag(true)
  await syncReminders()
}

export async function disableReminders(): Promise<void> {
  const cfg = getCfg()
  setFlag(false)
  try { const reg = await navigator.serviceWorker.ready; await (await reg.pushManager.getSubscription())?.unsubscribe() } catch { /* already gone */ }
  if (cfg) await call(DEFAULT_API, '/api/push/subscription', { method: 'DELETE', token: cfg.token }).catch(() => undefined)
}

export const sendTestReminder = () => { const cfg = getCfg(); if (!cfg) throw new Error('Not connected'); return call(DEFAULT_API, '/api/push/test', { method: 'POST', token: cfg.token }) }

/** Keep the server's copy of the week fresh: on start, when the app comes back, and hourly. */
let started = false
export function startReminders() {
  if (started || typeof document === 'undefined') return; started = true
  let last = 0
  const go = () => { if (Date.now() - last < 30 * 60000) return; last = Date.now(); void syncReminders().catch(() => undefined) }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go() })
  setInterval(go, 60 * 60000)
  setTimeout(go, 5000)
}
