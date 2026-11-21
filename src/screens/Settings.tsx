import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, CalendarPlus, Download, HardDriveDownload, Info, Pencil, Smartphone, Trash2, Upload } from 'lucide-react'
import { useStore, usePerson } from '../store'
import { NAME, WD_LABEL, WEEKDAYS, type Weekday } from '../types'
import { offDayOf } from '../engine/schedule'
import { DISCLAIMER } from '../data/common'
import { EXERCISES, NO_MEDIA, exName } from '../data/exercises'
import { loadManifest } from '../components/Media'
import { downloadBackup, importAll, resetAll } from '../lib/backup'
import { downloadICS } from '../lib/ics'
import { fmtDate, programEnd, week1Start, weekdayOf } from '../engine/calendar'
import { targets } from '../engine/nutrition'
import { SyncPanel } from './SyncPanel'
import { disableReminders, enableReminders, remindersOn, remindersSupported, sendTestReminder, syncReminders } from '../lib/reminders'
import { Btn, Card, Section, Segmented, Sheet, cx } from '../components/ui'

const Row = ({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 min-h-[56px] py-2 border-b border-line/40 last:border-0">
    <div className="min-w-0"><div className="text-[15px]">{label}</div>{sub && <div className="text-[12px] text-mute">{sub}</div>}</div><div className="shrink-0">{children}</div>
  </div>
)
const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx('w-[52px] h-8 rounded-full p-1 transition-colors', on ? 'accent-grad' : 'bg-s3')}>
    <motion.span layout className="block w-6 h-6 rounded-full bg-white shadow" style={{ marginLeft: on ? 20 : 0 }} />
  </button>
)

export function Settings() {
  const person = usePerson()
  const s = useStore()
  const p = s.profiles[person]
  const t = targets(person, p)
  const [media, setMedia] = useState<{ done: number; total: number } | null>(null)
  const [imp, setImp] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [photos, setPhotos] = useState(false)
  const [rem, setRem] = useState(remindersOn())
  const [remBusy, setRemBusy] = useState(false)
  const toggleRem = async (on: boolean) => {
    setRemBusy(true)
    try { if (on) { await enableReminders(); setRem(true); s.say('Reminders on for this phone') } else { await disableReminders(); setRem(false) } }
    catch (e) { s.say((e as Error).message) } finally { setRemBusy(false) }
  }
  const [tab, setTab] = useState<'you' | 'plan' | 'data'>('you')
  const file = useRef<HTMLInputElement>(null)
  const sunStart = weekdayOf(s.settings.programStart) === 'sun'

  const downloadMedia = async () => {
    const m = await loadManifest()
    const urls = [...EXERCISES.flatMap((e) => e.media.fallback ?? []), ...Object.values(m).flatMap((x) => [x.male?.video, x.male?.poster, x.female?.video, x.female?.poster].filter((u): u is string => !!u))]
    setMedia({ done: 0, total: urls.length })
    const cache = 'caches' in window ? await caches.open('hf-media') : null
    let done = 0
    for (const u of urls) {
      try { if (!(await caches.match(u))) { const r = await fetch(u); if (r.ok && cache && u.startsWith('/media/hf/')) await cache.put(u, r.clone()) } } catch { /* offline or missing */ }
      setMedia({ done: ++done, total: urls.length })
    }
    s.say('All exercise media is ready offline')
  }

  return (
    <motion.div className="fixed inset-0 z-50 bg-bg flex flex-col h-dvh-full" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }}>
      <div className="max-w-[520px] w-full mx-auto flex flex-col h-full">
        <div className="safe-t shrink-0 flex items-center gap-2 px-3 py-2">
          <button type="button" aria-label="Back" onClick={() => s.open(null)} className="w-11 h-11 grid place-items-center rounded-full bg-s2 border border-line/60"><ArrowLeft size={20} /></button>
          <h1 className="display font-semibold text-[20px]">Settings</h1>
        </div>
        <div className="px-4 pb-2"><Segmented id="set-tab" value={tab} onChange={setTab} options={[{ value: 'you', label: 'You' }, { value: 'plan', label: 'Plan' }, { value: 'data', label: 'Data' }]} /></div>
        <div className="flex-1 overflow-y-auto px-4 pb-10 no-scrollbar">
          {tab === 'you' && <>
          <Section title="This phone" className="!mt-2">
            <Card>
              <Row label="Whose phone is this?" sub="The app opens on this person and warns when you’re viewing the other."><Segmented id="set-me" small value={s.me ?? 'none'} onChange={(v) => s.set((x) => { x.me = v === 'none' ? null : v })} options={[{ value: 'vikas', label: 'Vikas' }, { value: 'varsha', label: 'Varsha' }]} /></Row>
              <Row label="Hide my weight from the other phone" sub="Hides your kg and weight chart when the other person views you. A courtesy, not a lock: both phones share the same data."><Toggle label="Hide my weight" on={!!s.profiles[s.me ?? person].hideWeight} onChange={(v) => s.set((x) => { x.profiles[x.me ?? person].hideWeight = v })} /></Row>
            </Card>
          </Section>
          <Section title="Reminders">
            <Card>
              <Row label="Meal, water and gym reminders" sub={remindersSupported() ? 'Pushed from the server to this phone for whoever owns it. Needs the app installed to your Home Screen on iPhone.' : 'Not available in this browser. On iPhone, add the app to your Home Screen first.'}><Toggle label="Reminders" on={rem} onChange={(v) => { if (!remBusy) void toggleRem(v) }} /></Row>
              {rem && <Btn kind="soft" className="w-full mt-2" onClick={() => void sendTestReminder().then(() => s.say('Test sent. It should arrive in a few seconds.')).catch((e: Error) => s.say(e.message))}>Send a test reminder</Btn>}
              {rem && <p className="text-[12px] text-mute mt-2">Each phone uploads the next 7 days of reminders whenever you open the app, so open it at least once a week.</p>}
            </Card>
          </Section>
          <Section title={`${NAME[person]}’s profile`}>
            <Card>
              <div className="grid grid-cols-4 gap-2 text-center mb-2">{[['Height', `${p.heightCm} cm`], ['Weight', p.hideWeight && s.me && s.me !== person ? 'Hidden' : `${p.weightKg} kg`], ['Age', `${p.age}`], ['Gym', p.gymTime]].map(([l, v]) => <div key={l} className="rounded-xl bg-s2 py-2"><div className="display font-semibold num">{v}</div><div className="text-[11px] text-mute">{l}</div></div>)}</div>
              <div className="text-[13px] text-mute num">BMR ≈ {t.bmr} · TDEE ≈ {t.tdee} · Target ≈ {t.kcal} kcal · Protein ≈ {t.protein} g{t.floored ? ' · at the 1,350 floor' : ''}</div>
              <Btn kind="soft" className="w-full mt-3" onClick={() => s.open({ type: 'profile', person })}>Edit stats, gym time and diet</Btn>
              <Row label="Diet" sub="Veg-only removes egg meals"><Segmented id="set-veg" small value={p.veg ? 'veg' : 'egg'} onChange={(v) => s.set((x) => { x.profiles[person].veg = v === 'veg' })} options={[{ value: 'egg', label: 'Eggetarian' }, { value: 'veg', label: 'Veg' }]} /></Row>
              <Row label="Weekly day off" sub="Sessions re-flow around it (Lower B and Active recovery move one day later). Skipping a day pushes the rest of the week later."><select aria-label="Weekly day off" data-testid="off-day" value={offDayOf(person, p) ?? 'none'} onChange={(e) => { const v = e.target.value as Weekday | 'none'; s.set((x) => { x.profiles[person].offDay = v }); void syncReminders().catch(() => undefined); s.say(v === 'none' ? 'No fixed day off' : `${WD_LABEL[v]} is your day off`) }}
                className="bg-s2 border border-line/60 rounded-xl px-3 min-h-[44px] text-[15px]"><option value="none">None</option>{WEEKDAYS.map((d) => <option key={d} value={d}>{WD_LABEL[d]}</option>)}</select></Row>
              {person === 'vikas' && <Row label="Trainer approved my squat form" sub="Switches Tuesday from goblet squat to back squat"><Toggle label="Squat approved" on={!!p.squatApproved} onChange={(v) => s.set((x) => { x.profiles.vikas.squatApproved = v })} /></Row>}
              <Row label="Units"><span className="text-mute">kg · cm</span></Row>
            </Card>
          </Section>

          </>}
          {tab === 'plan' && <>
          <Section title="Program" className="!mt-2">
            <Card>
              <Btn className="w-full mb-2" onClick={() => s.open({ type: 'editor', tab: 'workout' })}><Pencil size={18} /> Edit workouts and meals</Btn>
              <Row label="Program start date" sub={`Week 1 starts ${fmtDate(week1Start(s.settings.programStart))} · ends ${fmtDate(programEnd(s.settings.programStart), { day: 'numeric', month: 'short', year: 'numeric' })}`}>
                <input aria-label="Program start date" type="date" value={s.settings.programStart} onChange={(e) => e.target.value && s.set((x) => { x.settings.programStart = e.target.value })} className="bg-s2 rounded-xl px-2 min-h-[44px] text-[14px]" /></Row>
              <Row label="My gym is closed Sunday → start on Monday" sub={sunStart ? 'Day 0 becomes a lighter first session on Week 1 Monday' : 'Only applies when the start date is a Sunday'}><Toggle label="Merge Day 0 into Monday" on={s.settings.mergeDay0} onChange={(v) => s.set((x) => { x.settings.mergeDay0 = v })} /></Row>
              <Btn kind="soft" className="w-full mt-3" onClick={() => downloadICS(person, p, s.settings.programStart)}><CalendarPlus size={18} /> Add to Calendar (.ics)</Btn>
              <p className="text-[12px] text-mute mt-2">Adds recurring gym sessions and key meals for {NAME[person]} with 15-minute alerts. The app doesn’t send its own reminders — web push without a server isn’t reliable on iPhone, so your calendar does it.</p>
            </Card>
          </Section>

          </>}
          {tab === 'you' && <>
          <Section title="App">
            <Card>
              <Row label="Theme"><Segmented id="theme" small value={s.settings.theme} onChange={(v) => s.set((x) => { x.settings.theme = v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Auto' }]} /></Row>
              <Row label="Sounds" sub="Rest-timer chimes. iPhones don’t vibrate for web apps."><Toggle label="Sounds" on={s.settings.sounds} onChange={(v) => s.set((x) => { x.settings.sounds = v })} /></Row>
              <Row label="Creatine reminder" sub="3–5 g/day, optional"><Toggle label="Supplements" on={s.settings.creatine} onChange={(v) => s.set((x) => { x.settings.creatine = v })} /></Row>
              <Btn kind="soft" className="w-full mt-3" onClick={() => s.open({ type: 'install' })}><Smartphone size={18} /> How to install on iPhone</Btn>
            </Card>
          </Section>

          </>}
          {tab === 'data' && <>
          <SyncPanel />

          <Section title="Offline media">
            <Card>
              <p className="text-[14px] text-mute">Exercise photos are saved with the app. This also fetches any new demo videos.</p>
              {media && <div className="mt-3"><div className="h-2.5 rounded-full bg-s3 overflow-hidden" role="progressbar" aria-valuenow={media.done} aria-valuemin={0} aria-valuemax={media.total}><div className="h-full accent-grad transition-all" style={{ width: `${(media.done / Math.max(1, media.total)) * 100}%` }} /></div><div className="text-[12px] text-mute num mt-1">{media.done} / {media.total}</div></div>}
              <Btn kind="soft" className="w-full mt-3" onClick={downloadMedia}><HardDriveDownload size={18} /> Download all media for offline</Btn>
              {NO_MEDIA.length > 0 && <p className="text-[12px] text-mute mt-2">Body-map only for now: {NO_MEDIA.map(exName).join(', ')}.</p>}
            </Card>
          </Section>

          <Section title="Backup">
            <Card>
              <p className="text-[14px] text-mute">Your data is also saved in the shared database, so a lost phone doesn’t lose it. Photos stay on the phone that took them, so back those up.{s.flags.lastBackup ? ` Last backup: ${new Date(s.flags.lastBackup).toLocaleDateString('en-IN')}.` : ''}</p>
              <Row label="Include progress photos" sub="Makes the file much larger"><Toggle label="Include photos" on={photos} onChange={setPhotos} /></Row>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Btn onClick={() => void downloadBackup(photos)}><Download size={18} /> Export</Btn>
                <Btn kind="soft" onClick={() => file.current?.click()}><Upload size={18} /> Import</Btn>
              </div>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImp(await f.text()); e.target.value = '' }} />
              <p className="text-[12px] text-mute mt-2">To share logs between your two phones: export on one, send the file (AirDrop/WhatsApp), then Import → Merge on the other.</p>
            </Card>
          </Section>

          <Section title="About">
            <Card>
              <div className="flex gap-2 text-[14px]"><Info size={18} className="shrink-0 mt-0.5 text-mute" /><p>{DISCLAIMER}</p></div>
              <p className="text-[12px] text-mute mt-3">Exercise photos: free-exercise-db (public domain). V² Fit v1.0.</p>
              <Btn kind="danger" className="w-full mt-4" onClick={() => setConfirm(true)}><Trash2 size={18} /> Reset everything</Btn>
            </Card>
          </Section>
          </>}
        </div>
      </div>
      <Sheet open={!!imp} onClose={() => setImp(null)} title="Import backup">
        <p className="text-[14px] text-mute mb-4">Merge keeps what’s on this phone and adds the file’s records (newest wins). Replace wipes this phone first.</p>
        <div className="space-y-2">
          <Btn className="w-full" onClick={async () => { try { s.say(await importAll(imp!, 'merge')) } catch (e) { s.say((e as Error).message) } setImp(null) }}>Merge with this phone</Btn>
          <Btn kind="danger" className="w-full" onClick={async () => { try { s.say(await importAll(imp!, 'replace')) } catch (e) { s.say((e as Error).message) } setImp(null) }}>Replace everything</Btn>
        </div>
      </Sheet>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Reset everything?">
        <p className="text-[14px] text-mute mb-4">This deletes all logs, photos and settings on this phone and disconnects it from the shared database (the shared copy is kept). Export a backup first if you might want your photos.</p>
        <div className="space-y-2"><Btn kind="danger" className="w-full" onClick={() => void resetAll()}>Yes, delete everything</Btn><Btn kind="soft" className="w-full" onClick={() => setConfirm(false)}>Cancel</Btn></div>
      </Sheet>
    </motion.div>
  )
}
