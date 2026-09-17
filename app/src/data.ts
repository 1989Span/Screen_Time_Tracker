// Ported from `project/Gauge Screen Time.dc.html` (turn 3 script block).
// Deterministic pseudo-random demo dataset — same formulas as the mockup,
// anchored to the same fixed "today" so the numbers it shows match it.

import { CCOL } from './theme';

export type RangeId = 'day' | 'week' | 'month' | 'year';

export interface Cat {
  id: string;
  name: string;
  base: number;
  peak: number;
  work?: boolean;
}

export const CATS: Cat[] = [
  { id: 'social', name: 'Social', base: 96, peak: 21 },
  { id: 'video', name: 'Video', base: 74, peak: 22 },
  { id: 'work', name: 'Work', base: 118, peak: 11, work: true },
  { id: 'messaging', name: 'Messaging', base: 52, peak: 13 },
  { id: 'games', name: 'Games', base: 34, peak: 20 },
  { id: 'music', name: 'Music', base: 38, peak: 9 },
  { id: 'reading', name: 'Reading', base: 22, peak: 23 },
  { id: 'navigation', name: 'Navigation', base: 16, peak: 8 },
];

export { CCOL };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWI = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TODAY = new Date(2026, 7, 25);
const CUR_HOUR = 19;
const DAY = 86400000;

export const RANGE_LABEL: Record<RangeId, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };
export const N_DAYS: Record<RangeId, number> = { day: 1, week: 7, month: 30, year: 365 };

function rnd(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const _w: Record<number, number[]> = {};
function weights(ai: number): number[] {
  if (_w[ai]) return _w[ai];
  const p = CATS[ai].peak;
  const w: number[] = [];
  let s = 0;
  for (let h = 0; h < 24; h++) {
    let d = Math.abs(h - p);
    d = Math.min(d, 24 - d);
    const v = Math.exp(-(d * d) / 7) * (h < 6 ? 0.12 : 1);
    w.push(v);
    s += v;
  }
  _w[ai] = w.map((v) => v / s);
  return _w[ai];
}

const _raw: Record<number, number[]> = {};
function raw(idx: number): number[] {
  if (_raw[idx]) return _raw[idx];
  const dow = new Date(TODAY.getTime() - idx * DAY).getDay();
  const wk = dow === 0 || dow === 6;
  _raw[idx] = CATS.map((a, ai) => {
    const f = a.work ? (wk ? 0.12 : 1.12) : wk ? 1.34 : 0.92;
    return a.base * f * (1 + 0.14 * Math.sin(idx / 57)) * (0.55 + 0.95 * rnd(ai + 1, idx + 3));
  });
  return _raw[idx];
}

function hourByCat(idx: number, h: number): number[] {
  if (idx === 0 && h > CUR_HOUR) return CATS.map(() => 0);
  return raw(idx).map((v, ai) => v * weights(ai)[h]);
}

function dayByCat(idx: number): number[] {
  if (idx !== 0) return raw(idx);
  const out = CATS.map(() => 0);
  for (let h = 0; h <= CUR_HOUR; h++) hourByCat(0, h).forEach((v, i) => (out[i] += v));
  return out;
}

export function fmt(m: number): string {
  m = Math.round(m);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  const p: string[] = [];
  if (d) p.push(d + 'd');
  if (d || h) p.push(h + 'h');
  p.push(mm + 'm');
  return p.join(' ');
}

export function fmtShort(m: number): string {
  m = Math.round(Math.abs(m));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + mm + 'm';
  return mm + 'm';
}

export const PRESETS = [15, 30, 45, 60, 90, 120, 180, 240];

export function limLabel(v: number): string {
  return v < 60 ? v + 'm' : v % 60 ? Math.floor(v / 60) + 'h ' + (v % 60) + 'm' : v / 60 + 'h';
}

export function factFor(range: RangeId, mins: number): string {
  const r = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  const t = fmtShort(mins);
  if (mins < 5) return 'Nothing to report yet — the phone stayed in your pocket.';
  if (range === 'day') return 'Did you watch ' + r(mins / 112) + ' films back to back, or spend ' + t + ' on cats freaking out?';
  if (range === 'week') return t + ' is ' + r(mins / 450) + ' flights to New York. You could have landed, had dinner and flown home.';
  if (range === 'month') return 'The same ' + t + ' covers ' + r(mins / 480) + ' novels — or ' + r(mins / 24) + ' episodes you will not remember tomorrow.';
  return t + ' of your year went thumb-first. Enough to learn the guitar. Badly. Twice.';
}

function dstr(idx: number): string {
  const d = new Date(TODAY.getTime() - idx * DAY);
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
}

function dshort(idx: number): string {
  const d = new Date(TODAY.getTime() - idx * DAY);
  return d.getDate() + ' ' + MON[d.getMonth()];
}

function hourLabel(h: number): string {
  const f = (t: number) => (t % 12 === 0 ? 12 : t % 12) + (t < 12 ? 'am' : 'pm');
  return f(h) + '–' + f((h + 1) % 24);
}

export const DATES: Record<RangeId, string> = {
  day: dstr(0),
  week: dshort(6) + ' – ' + dshort(0),
  month: dshort(29) + ' – ' + dshort(0),
  year: MON[(TODAY.getMonth() + 1) % 12] + ' ' + (TODAY.getFullYear() - 1) + ' – ' + MON[TODAY.getMonth()] + ' ' + TODAY.getFullYear(),
};

export interface Bucket {
  per: number[];
  tick: string;
  label: string;
}

export function buckets(range: RangeId): Bucket[] {
  const out: Bucket[] = [];
  if (range === 'day') {
    for (let h = 0; h < 24; h++) {
      out.push({
        per: hourByCat(0, h),
        tick: h % 6 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : (h % 12) + (h < 12 ? 'a' : 'p')) : '',
        label: hourLabel(h) + ', today',
      });
    }
  } else if (range === 'week' || range === 'month') {
    const n = range === 'week' ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(TODAY.getTime() - i * DAY);
      out.push({ per: dayByCat(i), tick: range === 'week' ? DOWI[d.getDay()] : String(d.getDate()), label: dstr(i) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
      const per = CATS.map(() => 0);
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      for (let k = 1; k <= n; k++) {
        const idx = Math.round((TODAY.getTime() - new Date(d.getFullYear(), d.getMonth(), k).getTime()) / DAY);
        if (idx < 0) continue;
        dayByCat(idx).forEach((v, a) => (per[a] += v));
      }
      out.push({ per, tick: MON[d.getMonth()][0], label: MON[d.getMonth()] + ' ' + d.getFullYear() });
    }
  }
  return out;
}

export function prevTotal(range: RangeId, tr: boolean[]): number {
  const sum = (per: number[]) => per.reduce((s, v, i) => s + (tr[i] ? v : 0), 0);
  let t = 0;
  if (range === 'day') {
    for (let h = 0; h <= CUR_HOUR; h++) t += sum(hourByCat(1, h));
  } else if (range === 'week') {
    for (let i = 7; i < 14; i++) t += sum(dayByCat(i));
  } else if (range === 'month') {
    for (let i = 30; i < 60; i++) t += sum(dayByCat(i));
  } else {
    for (let i = 365; i < 730; i++) t += sum(dayByCat(i));
  }
  return t;
}

export interface SliceRow {
  name: string;
  time: string;
  pct: number;
  share: string;
  ci: number;
  tone: string;
}

export interface Slice {
  bk: Bucket[];
  totals: number[];
  max: number;
  sel: number | null;
  scoped: number[];
  total: number;
  order: number[];
  rows: SliceRow[];
}

export function slice(range: RangeId, sel: number | null, tr: boolean[]): Slice {
  const bk = buckets(range);
  const tot = (per: number[]) => per.reduce((s, v, i) => s + (tr[i] ? v : 0), 0);
  const totals = bk.map((b) => tot(b.per));
  const max = Math.max(1, ...totals);
  const s = sel != null && sel < bk.length ? sel : null;
  const scoped = s != null ? bk[s].per : bk.reduce((a, b) => (b.per.forEach((v, i) => (a[i] += v)), a), CATS.map(() => 0));
  const total = tot(scoped);
  const order = CATS.map((c, i) => i)
    .filter((i) => tr[i] && scoped[i] > 0.4)
    .sort((x, y) => scoped[y] - scoped[x]);
  const topV = order.length ? scoped[order[0]] : 1;
  const rows: SliceRow[] = order.map((i) => ({
    name: CATS[i].name,
    time: fmt(scoped[i]),
    pct: Math.max(2, (scoped[i] / topV) * 100),
    share: Math.round((scoped[i] / Math.max(1, total)) * 100) + '%',
    ci: i,
    tone: CCOL[i],
  }));
  return { bk, totals, max, sel: s, scoped, total, order, rows };
}

export function dayUsage(): number[] {
  return dayByCat(0);
}

export function fourteenDayAvg(catIndex: number): number {
  let s = 0;
  for (let i = 1; i <= 14; i++) s += dayByCat(i)[catIndex];
  return s / 14;
}

// Groups — other members' days use the same shape as raw()/dayByCat(), with a
// per-category usage scale and a seed so each person gets their own numbers.

/** Calendar date `idx` days before today (DST-safe). */
export function dateAt(idx: number): Date {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - idx);
}

export function dayLabel(idx: number): string {
  const d = dateAt(idx);
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
}

/** Your own day (all categories), full day for idx >= 1, so far for today. */
export function myDay(idx: number): number[] {
  return dayByCat(idx);
}

export function memberDay(idx: number, scale: number[], seed: number): number[] {
  const dow = dateAt(idx).getDay();
  const wk = dow === 0 || dow === 6;
  return CATS.map((a, ai) => {
    const f = a.work ? (wk ? 0.12 : 1.12) : wk ? 1.34 : 0.92;
    let v = a.base * scale[ai] * f * (0.55 + 0.95 * rnd(ai + 1 + seed * 17, idx + 3 + seed * 29));
    if (idx === 0) v *= weights(ai).slice(0, CUR_HOUR + 1).reduce((s, w) => s + w, 0);
    return v;
  });
}

// Penalty limit (simulated ledger — no real money moves). The demo pretends
// the app was installed on INSTALL_DATE with DEMO_PENALTY active ever since;
// every settled day's charge sits in a locked balance until UNLOCK_DATE.

export interface PenaltySetting {
  limit: number; // minutes per day
  rate: number; // dollars per minute over
}

export const INSTALL_DATE = new Date(2026, 2, 1);
export const UNLOCK_DATE = new Date(INSTALL_DATE.getFullYear() + 1, INSTALL_DATE.getMonth(), INSTALL_DATE.getDate());
// 4h so that "today so far" (~4h 07m at CUR_HOUR) already shows an overage.
export const DEMO_PENALTY: PenaltySetting = { limit: 240, rate: 0.1 };
export const DEFAULT_PENALTY: PenaltySetting = { limit: 360, rate: 1 };
export const PENALTY_LIMIT_PRESETS = [120, 180, 240, 300, 360, 420, 480, 600];
export const RATE_PRESETS = [0.25, 0.5, 1, 2, 5];
export const RATE_MIN = 0.01;
export const RATE_MAX = 1000;

export function fmtMoney(v: number): string {
  const cents = Math.round(v * 100);
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return '$' + whole + '.' + String(cents % 100).padStart(2, '0');
}

export function fmtDate(d: Date): string {
  return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
}

/** Whole minutes past the limit — partial minutes aren't charged. */
export function minutesOver(used: number, limit: number): number {
  return Math.max(0, Math.floor(used - limit));
}

export function chargeFor(used: number, s: PenaltySetting): number {
  return Math.round(minutesOver(used, s.limit) * s.rate * 100) / 100;
}

export function trackedToday(tr: boolean[]): number {
  return dayByCat(0).reduce((s, v, i) => s + (tr[i] ? v : 0), 0);
}

export function daysUntilUnlock(): number {
  return Math.round((UNLOCK_DATE.getTime() - TODAY.getTime()) / DAY);
}

export interface ChargeDay {
  label: string;
  used: number;
  over: number;
  limit: number;
  charge: number;
  balance: number; // locked balance after this day settled
}

let _history: ChargeDay[] | null = null;
/** Settled days, newest first (yesterday back to install day). Past days were
 *  settled with every category tracked, so later toggles don't rewrite them. */
export function chargeHistory(): ChargeDay[] {
  if (_history) return _history;
  const n = Math.round((TODAY.getTime() - INSTALL_DATE.getTime()) / DAY);
  const out: ChargeDay[] = [];
  let balance = 0;
  for (let idx = n; idx >= 1; idx--) {
    const used = dayByCat(idx).reduce((s, v) => s + v, 0);
    const charge = chargeFor(used, DEMO_PENALTY);
    balance = Math.round((balance + charge) * 100) / 100;
    // dayLabel() rather than dstr(): subtracting 24h steps drifts a day
    // across the March DST change.
    out.push({ label: dayLabel(idx), used,over: minutesOver(used, DEMO_PENALTY.limit), limit: DEMO_PENALTY.limit, charge, balance });
  }
  _history = out.reverse();
  return _history;
}
