import type { jsPDF } from 'jspdf'
import type { MuscleId } from '../types'
import { fmtDate } from '../engine/calendar'
import { ascii } from './insightsPdf'
import { BODY_ASPECT, RAMP, bodyPng, heatColor } from './bodySvg'
import { balanceNotes, findings, fmtHM, fmtMS, muscleName, type ExRow, type Report, type SessionRep } from './workoutReport'

export interface WorkoutPdfInput { name: string; goal: string; report: Report; generated: string }
type RGB = [number, number, number]
const NAVY: RGB = [12, 19, 40], INK: RGB = [24, 32, 52], MUTE: RGB = [104, 113, 138], LINE: RGB = [221, 226, 238], PANEL: RGB = [245, 247, 252]
const ACC: RGB = [29, 78, 216], ACC2: RGB = [34, 170, 210], GOOD: RGB = [22, 150, 90], WARN: RGB = [210, 120, 10]
const W = 210, M = 14, CW = W - 2 * M, MAX_PAGES = 5
const n0 = (n: number) => Math.round(n).toLocaleString('en-IN')
const dd = (x: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => ascii(fmtDate(x, o))

interface Imgs { front: string; back: string; per: Map<string, { front: string; back: string }> }

function sessionHeat(s: SessionRep): Partial<Record<MuscleId, number>> {
  const mx = Math.max(1, ...Object.values(s.direct) as number[])
  const h: Partial<Record<MuscleId, number>> = {}
  for (const [m, v] of Object.entries(s.indirect)) h[m as MuscleId] = 0.18
  for (const [m, v] of Object.entries(s.direct)) h[m as MuscleId] = 0.4 + 0.6 * ((v as number) / mx)
  return h
}

/** Draws the whole report into `doc`. `full` = how many of the most recent workouts get a full card (the rest become one-line rows). */
function draw(doc: jsPDF, p: WorkoutPdfInput, img: Imgs | null, full: number): number {
  const r = p.report, t = r.totals
  let y = 0
  const font = (bold: boolean, size: number, color: RGB) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color) }
  const text = (s: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; maxW?: number; space?: number } = {}) => {
    font(!!o.bold, o.size ?? 9, o.color ?? INK)
    let v = ascii(s)
    if (o.maxW) { while (v.length > 1 && doc.getTextWidth(v) > o.maxW) v = v.slice(0, -2).trimEnd() + (v.length > 2 ? '' : ''); if (ascii(s) !== v) v = v.slice(0, -1) + '...' }
    if (o.space) (doc as unknown as { setCharSpace: (n: number) => void }).setCharSpace(o.space)
    doc.text(v, x, yy, { align: o.align ?? 'left' })
    if (o.space) (doc as unknown as { setCharSpace: (n: number) => void }).setCharSpace(0)
  }
  const fill = (c: RGB) => doc.setFillColor(...c)
  const rect = (x: number, yy: number, w: number, h: number, c: RGB, rad = 0) => { fill(c); if (rad) doc.roundedRect(x, yy, w, h, rad, rad, 'F'); else doc.rect(x, yy, w, h, 'F') }
  const hline = (yy: number, c: RGB = LINE, x1 = M, x2 = W - M) => { doc.setDrawColor(...c); doc.setLineWidth(0.2); doc.line(x1, yy, x2, yy) }
  const page = () => { doc.addPage(); y = 20 }
  const need = (h: number) => { if (y + h > 280) page() }
  const section = (label: string, sub?: string, minH = 16) => {
    need(minH); rect(M, y - 3.6, 1.4, 5.6, ACC, 0.5); text(label.toUpperCase(), M + 4, y + 0.6, { size: 9.5, bold: true, space: 0.5 })
    if (sub) text(sub, W - M, y + 0.6, { size: 7.5, color: MUTE, align: 'right' })
    y += 3.5; hline(y); y += 5
  }

  // ---------------------------------------------------------------- header
  rect(0, 0, W, 38, NAVY); rect(0, 38, W, 1.2, ACC)
  text('V2 FIT  |  WORKOUT REPORT', M, 11, { size: 7.5, bold: true, color: [120, 160, 255], space: 1 })
  text(p.name, M, 23, { size: 23, bold: true, color: [255, 255, 255] })
  text(p.goal, M, 31, { size: 9.5, color: [160, 175, 210] })
  text(`${dd(r.from)} - ${dd(r.to, { day: 'numeric', month: 'short', year: 'numeric' })}`, W - M, 17, { size: 12, bold: true, color: [255, 255, 255], align: 'right' })
  text(`${r.days} days  |  generated ${p.generated}`, W - M, 24, { size: 8, color: [160, 175, 210], align: 'right' })
  y = 47

  // ---------------------------------------------------------------- KPI tiles
  const planned = Math.max(t.planned, t.workouts), adh = planned ? Math.round((t.workouts / planned) * 100) : null
  const kpis: [string, string, string][] = [
    ['Workouts', String(t.workouts), planned ? `of ${planned} planned  |  ${adh}%` : 'completed'],
    ['Training time', fmtHM(t.minutes), t.workouts ? `avg ${fmtHM(t.avgMinutes)} per session` : '-'],
    ['Volume lifted', `${n0(t.volume)} kg`, t.workouts ? `avg ${n0(t.volume / t.workouts)} kg per session` : '-'],
    ['Working sets', String(t.sets), `${n0(t.reps)} reps`],
    ['Energy burnt', `${n0(t.kcal)} kcal`, 'in workouts, est. above resting'],
    ['Personal records', String(t.prs), 'new best lifts'],
    ['Cardio logged', t.cardioSec ? fmtHM(Math.round(t.cardioSec / 60)) : '-', t.cardioSec ? `about ${n0(t.cardioKcal)} kcal` : 'none this period'],
    ['Muscles trained', `${t.musclesHit} / 23`, r.muscles[0] ? `most: ${r.muscles[0].name}` : '-'],
  ]
  const tw = (CW - 9) / 4
  kpis.forEach((k, i) => {
    const x = M + (i % 4) * (tw + 3), yy = y + Math.floor(i / 4) * 24
    rect(x, yy, tw, 21, PANEL, 2.2); rect(x, yy + 3, 1, 15, ACC, 0.5)
    text(k[0].toUpperCase(), x + 4, yy + 6, { size: 6.5, bold: true, color: MUTE, space: 0.3 })
    text(k[1], x + 4, yy + 13.8, { size: 14, bold: true })
    text(k[2], x + 4, yy + 18.4, { size: 6.6, color: MUTE, maxW: tw - 6 })
  })
  y += 50

  // ---------------------------------------------------------------- muscle activation hero
  section('Muscle activation', 'sets, direct + half of indirect')
  const figH = 74, figW = figH * BODY_ASPECT, fy = y
  rect(M, fy - 1, 76, figH + 12, PANEL, 3)
  if (img) {
    doc.addImage(img.front, 'PNG', M + 8, fy + 2, figW, figH); doc.addImage(img.back, 'PNG', M + 76 - 8 - figW, fy + 2, figW, figH)
  }
  text('FRONT', M + 8 + figW / 2, fy + figH + 7, { size: 6.5, bold: true, color: MUTE, align: 'center', space: 0.6 }); text('BACK', M + 76 - 8 - figW / 2, fy + figH + 7, { size: 6.5, bold: true, color: MUTE, align: 'center', space: 0.6 })
  // legend ramp
  const lx = M + 100, ly = fy + figH + 2
  for (let i = 0; i < 40; i++) rect(lx + (i * 70) / 40, ly, 70 / 40 + 0.2, 3, hexRGB(heatColor(i / 39)))
  text('light', lx, ly + 7, { size: 6.5, color: MUTE }); text('heavy', lx + 70, ly + 7, { size: 6.5, color: MUTE, align: 'right' })
  text('Colour = share of the most-trained muscle', lx, ly - 2, { size: 6.5, color: MUTE })
  // ranked bars
  const top = r.muscles.slice(0, 10), bx = M + 84, bw = CW - 84
  const mx = Math.max(1, ...top.map((m) => m.direct + m.indirect * 0.5))
  top.forEach((m, i) => {
    const yy = fy + 3 + i * 7.4
    text(m.name, bx, yy + 3.6, { size: 8, bold: i < 3, maxW: 40 })
    const bl = 44, bwid = bw - bl - 20
    rect(bx + bl, yy + 0.4, bwid, 4.4, [232, 236, 246], 1.2)
    const dw = (m.direct / mx) * bwid, iw = ((m.indirect * 0.5) / mx) * bwid
    if (dw > 0) rect(bx + bl, yy + 0.4, Math.max(1.6, dw), 4.4, hexRGB(heatColor(0.35 + 0.65 * ((m.direct + m.indirect * 0.5) / mx))), 1.2)
    if (iw > 0) rect(bx + bl + dw, yy + 0.4, Math.max(1, iw), 4.4, [170, 196, 250], 0.6)
    text(`${m.direct}${m.indirect ? ` + ${m.indirect}` : ''}`, bx + bw, yy + 3.8, { size: 7.5, bold: true, align: 'right' })
  })
  text('direct sets + indirect sets', bx + bw, fy + 3 + 10 * 7.4 + 1, { size: 6.5, color: MUTE, align: 'right' })
  y = fy + figH + 14

  // ---------------------------------------------------------------- calendar
  section('Training calendar', 'blue = trained, amber = skipped, grey = rest')
  const first = r.calendar[0], pad = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(first?.day ?? 'mon')
  const cells = [...Array(pad).fill(null), ...r.calendar]
  const rows = Math.ceil(cells.length / 7), cw = CW / 7
  const rh = Math.min(10.5, Math.max(3.2, 52 / rows)), showTxt = rh >= 8
  need(rows * rh + 12)
  ;['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].forEach((d, i) => text(d, M + i * cw + cw / 2, y, { size: 6.2, bold: true, color: MUTE, align: 'center', space: 0.4 }))
  y += 2
  cells.forEach((c, i) => {
    if (!c) return
    const x = M + (i % 7) * cw, yy = y + Math.floor(i / 7) * rh, tr = c.sessions.length > 0
    rect(x + 0.5, yy + 0.5, cw - 1, rh - 1, tr ? ACC : c.skipped ? [250, 226, 190] : PANEL, 1.2)
    if (showTxt) {
      text(c.date.slice(8), x + 2, yy + 3.6, { size: 6.2, bold: true, color: tr ? [190, 210, 255] : MUTE })
      if (tr) text(c.sessions.join(' + '), x + cw / 2, yy + rh - 2.4, { size: 6.6, bold: true, color: [255, 255, 255], align: 'center', maxW: cw - 3 })
      else if (c.skipped) text('skipped', x + cw / 2, yy + rh - 2.4, { size: 6.4, color: WARN, align: 'center' })
    }
  })
  y += rows * rh + 6

  // ---------------------------------------------------------------- key findings
  section('Key findings')
  for (const f of findings(r)) {
    const lines = doc.splitTextToSize(ascii(f), CW - 8) as string[]
    need(lines.length * 4.6 + 3)
    rect(M + 0.5, y - 1.6, 2, 2, ACC, 1)
    font(false, 9, INK); doc.text(lines, M + 6, y)
    y += lines.length * 4.4 + 2
  }

  // ---------------------------------------------------------------- muscle breakdown
  y += 4
  section('Muscle breakdown', 'every muscle trained in the period', 60)
  const cols = { name: M, grp: M + 46, d: M + 74, i: M + 90, reps: M + 108, vol: M + 128, ses: M + 146, last: M + 158 }
  const head = () => {
    rect(M, y - 4, CW, 6.4, PANEL, 1)
    ;[['Muscle', cols.name], ['Group', cols.grp], ['Direct', cols.d], ['Indirect', cols.i], ['Reps', cols.reps], ['Volume kg', cols.vol], ['Days', cols.ses], ['Last', cols.last]].forEach(([l, x]) => text(l as string, x as number, y, { size: 7, bold: true, color: MUTE }))
    y += 6
  }
  head()
  const dmax = Math.max(1, ...r.muscles.map((m) => m.direct))
  r.muscles.forEach((m, i) => {
    if (y > 270) { page(); head() }
    if (i % 2 === 0) rect(M, y - 3.8, CW, 6, [250, 251, 254])
    rect(M + 1, y - 2.4, 2.6, 2.6, hexRGB(heatColor(r.heat[m.id] ?? 0)), 0.6)
    text(m.name, cols.name + 5, y, { size: 8, bold: i < 3, maxW: 40 }); text(m.group, cols.grp, y, { size: 7.5, color: MUTE })
    text(String(m.direct), cols.d + 6, y, { size: 8, bold: true, align: 'right' })
    rect(cols.d + 8, y - 2.5, Math.max(0.6, (m.direct / dmax) * 8), 2.4, ACC, 0.6)
    text(String(m.indirect), cols.i + 7, y, { size: 8, align: 'right', color: MUTE }); text(n0(m.reps), cols.reps + 10, y, { size: 8, align: 'right' })
    text(m.volume ? n0(m.volume) : '-', cols.vol + 14, y, { size: 8, align: 'right' }); text(String(m.sessions), cols.ses + 6, y, { size: 8, align: 'right' }); text(m.last ? dd(m.last) : '-', cols.last, y, { size: 7.5, color: MUTE })
    y += 6
  })
  if (r.untrained.length) { y += 1; text(`Not trained: ${r.untrained.map(muscleName).join(', ')}`, M, y, { size: 7.5, color: WARN, maxW: CW }); y += 5 }
  text('Direct = sets where the muscle is the prime mover. Indirect = sets where it assists (counted at half weight in the colours).', M, y, { size: 6.8, color: MUTE, maxW: CW }); y += 8

  // balance
  section('Movement balance', 'direct sets by muscle group')
  need(34)
  const gcol: RGB[] = [[29, 78, 216], [34, 130, 220], [90, 150, 245], [34, 170, 210], [60, 80, 160], [150, 170, 230]]
  let gx = M
  r.groups.forEach((g, i) => { const w = g.share * CW; if (w > 0) { rect(gx, y, Math.max(0.8, w - 0.6), 9, gcol[i], 1); if (w > 16) text(`${Math.round(g.share * 100)}%`, gx + w / 2, y + 6, { size: 7.5, bold: true, color: [255, 255, 255], align: 'center' }); gx += w } })
  y += 15
  r.groups.forEach((g, i) => { const x = M + i * (CW / 6); rect(x, y - 2.4, 2.8, 2.8, gcol[i], 0.6); text(g.group, x + 4, y, { size: 7.5, bold: true }); text(`${g.sets} sets`, x + 4, y + 4, { size: 7, color: MUTE }) })
  y += 11
  for (const nline of balanceNotes(r)) { const lines = doc.splitTextToSize(ascii(nline), CW - 6) as string[]; need(lines.length * 4.4 + 2); rect(M + 0.5, y - 1.6, 2, 2, ACC2, 1); font(false, 8.8, INK); doc.text(lines, M + 5, y); y += lines.length * 4.3 + 1.8 }
  y += 4

  // ---------------------------------------------------------------- training load
  section('Training load', 'by week and by workout', 108)
  const half = (CW - 8) / 2
  const chart = (x: number, title: string, vals: { l: string; v: number }[], fmt: (n: number) => string, color: RGB) => {
    text(title, x, y, { size: 8, bold: true })
    const cy = y + 4, ch = 34, cmax = Math.max(1, ...vals.map((v) => v.v)), bwid = Math.min(14, (half - 4) / Math.max(1, vals.length) * 0.7), gap = (half - 4) / Math.max(1, vals.length)
    hline(cy + ch, LINE, x, x + half)
    vals.forEach((v, i) => {
      const hh = Math.max(0.6, (v.v / cmax) * (ch - 8)), bx2 = x + 2 + i * gap + (gap - bwid) / 2
      rect(bx2, cy + ch - hh, bwid, hh, color, 1)
      text(fmt(v.v), bx2 + bwid / 2, cy + ch - hh - 1.6, { size: 6.6, bold: true, align: 'center' })
      text(v.l, bx2 + bwid / 2, cy + ch + 4, { size: 6.2, color: MUTE, align: 'center' })
    })
  }
  chart(M, 'Volume per week (kg)', r.weeks.slice(-8).map((w) => ({ l: `w/c ${w.label}`, v: w.volume })), n0, ACC)
  chart(M + half + 8, 'Energy per workout (kcal)', r.sessions.slice(-8).map((s) => ({ l: dd(s.date), v: s.kcal })), n0, ACC2)
  y += 48
  chart(M, 'Working sets per week', r.weeks.slice(-8).map((w) => ({ l: `w/c ${w.label}`, v: w.sets })), (n) => String(n), [90, 130, 240])
  chart(M + half + 8, 'Duration per workout (min)', r.sessions.slice(-8).map((s) => ({ l: dd(s.date), v: s.minutes })), (n) => String(n), [60, 80, 160])
  y += 50

  // top lifts
  if (r.lifts.length) {
    section('Top lifts by volume', 'best set = heaviest completed set')
    need(14)
    rect(M, y - 4, CW, 6.4, PANEL, 1)
    ;[['#', M + 1], ['Exercise', M + 8], ['Best set', M + 84], ['Sets', M + 124], ['Volume kg', M + 140], ['Date', M + 164]].forEach(([l, x]) => text(l as string, x as number, y, { size: 7, bold: true, color: MUTE }))
    y += 6
    r.lifts.slice(0, 8).forEach((l, i) => { need(6); text(String(i + 1), M + 1, y, { size: 8, color: MUTE }); text(l.name, M + 8, y, { size: 8.2, bold: true, maxW: 72 }); text(l.best || '-', M + 84, y, { size: 8 }); text(String(l.sets), M + 124, y, { size: 8 }); text(l.volume ? n0(l.volume) : '-', M + 140, y, { size: 8 }); text(l.date ? dd(l.date) : '-', M + 164, y, { size: 7.5, color: MUTE }); y += 5.6 })
    y += 3
  }
  if (r.cardio.length) {
    section('Cardio', 'timed work from workouts and the stopwatch')
    r.cardio.forEach((c) => { need(6); text(c.name, M + 1, y, { size: 8.4, bold: true, maxW: 90 }); text(fmtHM(Math.round(c.sec / 60)) + ` (${fmtMS(c.sec)})`, M + 100, y, { size: 8 }); text(`~${n0(c.kcal)} kcal`, W - M, y, { size: 8, color: MUTE, align: 'right' }); y += 5.6 })
    y += 2
  }

  // ---------------------------------------------------------------- workout log
  const sess = r.sessions
  const fullList = sess.slice(Math.max(0, sess.length - full)), older = sess.slice(0, Math.max(0, sess.length - full))
  if (sess.length) {
    y += 4
    section('Workout log', `${sess.length} workout${sess.length > 1 ? 's' : ''}, oldest first`, 50)
    if (older.length) {
      text(`Earlier workouts (${older.length}), summary`, M, y, { size: 8.5, bold: true }); y += 4
      rect(M, y - 3.6, CW, 5.6, PANEL, 1)
      ;[['Date', M + 1], ['Workout', M + 24], ['Min', M + 70], ['kcal', M + 84], ['Sets', M + 98], ['Volume kg', M + 112], ['Main muscles', M + 134]].forEach(([l, x]) => text(l as string, x as number, y, { size: 6.8, bold: true, color: MUTE }))
      y += 5
      for (const s of older) {
        if (y > 275) { if (docPages(doc) >= MAX_PAGES) break; page() }
        const mm = Object.entries(s.direct).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3).map(([m]) => muscleName(m)).join(', ')
        text(dd(s.date, { weekday: 'short', day: 'numeric', month: 'short' }), M + 1, y, { size: 7.6 }); text(s.title, M + 24, y, { size: 7.6, bold: true, maxW: 44 }); text(String(s.minutes), M + 70, y, { size: 7.6 }); text(n0(s.kcal), M + 84, y, { size: 7.6 })
        text(String(s.sets), M + 98, y, { size: 7.6 }); text(s.volume ? n0(s.volume) : '-', M + 112, y, { size: 7.6 }); text(mm, M + 134, y, { size: 7, color: MUTE, maxW: 46 }); y += 5
      }
      y += 6
    }
    fullList.forEach((s, idx) => card(s, older.length + idx + 1))
  }

  function card(s: SessionRep, no: number) {
    const rowH = 4.9
    font(false, 7.4, INK)
    const tbl: { r: ExRow; lines: string[] }[] = s.rows.map((rw) => ({ r: rw, lines: doc.splitTextToSize(ascii(setsText(rw)), 53) as string[] }))
    const bodyH = Math.max(54, 7 + tbl.reduce((a, x) => a + Math.max(rowH, x.lines.length * 3.5 + 1.4), 0))
    const total = 12 + bodyH + 12
    need(total + 4)
    const top = y
    doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.roundedRect(M, top, CW, total, 2.5, 2.5, 'S')
    rect(M, top, CW, 11, NAVY, 2.5); rect(M, top + 6, CW, 5, NAVY)
    text(`${no}`, M + 4, top + 7.2, { size: 8.5, bold: true, color: [120, 160, 255] })
    text(s.title, M + 10, top + 7.2, { size: 10.5, bold: true, color: [255, 255, 255], maxW: 60 })
    text(dd(s.date, { weekday: 'short', day: 'numeric', month: 'short' }), M + 72, top + 7.2, { size: 8, color: [170, 185, 220] })
    const chips = [`${s.minutes} min`, `${n0(s.kcal)} kcal`, `${s.sets} sets`, s.volume ? `${n0(s.volume)} kg` : '', s.prs.length ? `${s.prs.length} PR` : ''].filter(Boolean)
    text(chips.join('   |   '), W - M - 3, top + 7.2, { size: 7.8, bold: true, color: [255, 255, 255], align: 'right' })
    // body maps
    const fy2 = top + 14, fw = 15, fh = fw / BODY_ASPECT
    rect(M + 2, fy2 - 1, 36, fh + 6, PANEL, 2)
    const pair = img?.per.get(s.id)
    if (pair) { doc.addImage(pair.front, 'PNG', M + 4, fy2, fw, fh); doc.addImage(pair.back, 'PNG', M + 22, fy2, fw, fh) }
    text('FRONT', M + 4 + fw / 2, fy2 + fh + 3, { size: 5.6, color: MUTE, align: 'center', bold: true }); text('BACK', M + 22 + fw / 2, fy2 + fh + 3, { size: 5.6, color: MUTE, align: 'center', bold: true })
    // table
    const tx = M + 40, tcols = { ex: tx, sets: tx + 44, vol: tx + 98, tg: tx + 98 }
    rect(tx - 1, top + 13, CW - 42, 5.2, PANEL, 1)
    ;[['Exercise', tx], ['Sets x reps @ kg', tx + 43], ['Vol. kg', tx + 98], ['Targets', tx + 113]].forEach(([l, x]) => text(l as string, x as number, top + 16.6, { size: 6.6, bold: true, color: MUTE }))
    void tcols
    let ry = top + 22.4
    for (const { r: rw, lines } of tbl) {
      const hgt = Math.max(rowH, lines.length * 3.5 + 1.4)
      text(rw.name, tx, ry, { size: 7.8, bold: true, maxW: rw.pr ? 33 : 40 })
      if (rw.pr) { rect(tx + 34, ry - 3, 6, 3.6, ACC, 1); text('PR', tx + 37, ry - 0.4, { size: 5.6, bold: true, color: [255, 255, 255], align: 'center' }) }
      font(false, 7.4, INK); doc.text(lines, tx + 43, ry)
      text(rw.volume ? n0(rw.volume) : '-', tx + 108, ry, { size: 7.6, align: 'right' })
      if (rw.primary.length) text(rw.primary.slice(0, 2).map(muscleName).join(', '), tx + 113, ry, { size: 6.4, color: MUTE, maxW: W - M - 3 - (tx + 113) })
      ry += hgt
      doc.setDrawColor(235, 238, 246); doc.setLineWidth(0.15); doc.line(tx - 1, ry - 3.2, W - M - 2, ry - 3.2)
    }
    // footer: muscles worked
    const fyy = top + 12 + bodyH
    hline(fyy, LINE, M + 2, W - M - 2)
    const dm = Object.entries(s.direct).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([m, v]) => `${muscleName(m)} ${v}`).join('  |  ')
    const im = Object.entries(s.indirect).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([m, v]) => `${muscleName(m)} ${v}`).join('  |  ')
    text('DIRECT', M + 4, fyy + 4.6, { size: 5.8, bold: true, color: ACC, space: 0.3 }); text(dm || '-', M + 18, fyy + 4.6, { size: 7, maxW: CW - 24 })
    text('INDIRECT', M + 4, fyy + 9, { size: 5.8, bold: true, color: MUTE, space: 0.3 }); text(im || '-', M + 18, fyy + 9, { size: 7, color: MUTE, maxW: CW - 24 })
    y = top + total + 5
  }
  void card  // hoisted

  // footer on every page
  const pages = docPages(doc)
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); hline(288, LINE); text(`V2 Fit  |  ${p.name}  |  Workout report  |  ${dd(r.from)} - ${dd(r.to)}`, M, 292.5, { size: 6.8, color: MUTE }); text(`Page ${i} of ${pages}`, W - M, 292.5, { size: 6.8, color: MUTE, align: 'right' })
  }
  return pages
}

const docPages = (d: jsPDF) => d.getNumberOfPages()
const hexRGB = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB

export function setsText(rw: ExRow): string {
  if (rw.kind === 'cardio') return `${fmtMS(rw.seconds)} min timed`
  const groups: { w: number; r: number; n: number }[] = []
  for (const s of rw.sets) { const l = groups[groups.length - 1]; if (l && l.w === s.w && l.r === s.r) l.n++; else groups.push({ w: s.w, r: s.r, n: 1 }) }
  const body = groups.map((g) => rw.kind === 'hold' ? `${g.n}x${g.r}s` : rw.kind === 'bw' ? `${g.n}x${g.r}` : `${g.n}x${g.r} @ ${g.w}`).join('  ')
  return rw.kind === 'bw' || rw.kind === 'hold' ? body : `${body} kg${rw.each ? ' each' : ''}`
}

export async function buildWorkoutPdf(p: WorkoutPdfInput): Promise<Blob> {
  const { jsPDF: PDF } = await import('jspdf')
  const r = p.report
  const heat = r.heat
  const per = new Map<string, { front: string; back: string }>()
  const [front, back] = await Promise.all([bodyPng('front', heat), bodyPng('back', heat)])
  for (const s of r.sessions.slice(-14)) { const h = sessionHeat(s); per.set(s.id, { front: await bodyPng('front', h), back: await bodyPng('back', h) }) }
  const imgs: Imgs = { front, back, per }
  // Find how many of the most recent workouts fit as full cards without going past five pages.
  let full = Math.min(r.sessions.length, 14)
  for (; full > 0; full--) {
    const trial = new PDF({ unit: 'mm', format: 'a4' })
    if (draw(trial, p, null, full) <= MAX_PAGES) break
  }
  const doc = new PDF({ unit: 'mm', format: 'a4' })
  doc.setProperties({ title: `V2 Fit workout report - ${p.name}`, author: 'V2 Fit', subject: `${r.from} to ${r.to}` })
  draw(doc, p, imgs, full)
  return doc.output('blob')
}
void RAMP
