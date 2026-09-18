// Derivation and presentation over whatever usage source is installed.
//
// This file owns no data of its own any more. Ranges, buckets, totals, the
// penalty ledger and every string the UI renders are computed here; the raw
// per-day and per-hour numbers come from ./usage/source. Swapping the demo
// generator for real Android UsageStats therefore touches nothing below.
//
// "Today" comes from ./clock rather than a frozen constant, so the app shows
// real dates on a device. Caches here are keyed by "days before today", which
// is only valid for one calendar day — hence the onDayChange registrations.

import { CCOL } from './theme';
import { checkDayRollover, currentHour, daysBetween, onDayChange, startOfToday, dateAt } from './clock';
import { CATS, Cat } from './usage/categories';
import { hasUsageSource, usageSource } from './usage/source';
import { demoSource } from './usage/demoSource';

export type RangeId = 'day' | 'week' | 'month' | 'year';

// Re-exported so existing imports keep working; the definitions now live with
// the source layer, because a real source is what decides what a category is.
export { CATS, CCOL };
export type { Cat };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWI = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const RANGE_LABEL: Record<RangeId, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };
export const N_DAYS: Record<RangeId, number> = { day: 1, week: 7, month: 30, year: 365 };

// The two primitives every derivation below is built on. Both delegate to the
// installed source; both return fresh arrays so a caller cannot reach into a
// source's cache and corrupt it for the rest of the process.
function hourByCat(idx: number, h: number): number[] {
  return usageSource().hourTotals(idx, h);
}

function dayByCat(idx: number): number[] {
  return usageSource().dayTotals(idx).slice();
}

// Day offsets change meaning at midnight, so the source's cache goes with ours.
onDayChange(() => {
  if (hasUsageSource()) usageSource().invalidate();
});

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
  if (range === 'day')
    return 'Did you watch ' + r(mins / 112) + ' films back to back, or spend ' + t + ' on cats freaking out?';
  if (range === 'week')
    return t + ' is ' + r(mins / 450) + ' flights to New York. You could have landed, had dinner and flown home.';
  if (range === 'month')
    return (
      'The same ' +
      t +
      ' covers ' +
      r(mins / 480) +
      ' novels — or ' +
      r(mins / 24) +
      ' episodes you will not remember tomorrow.'
    );
  return t + ' of your year went thumb-first. Enough to learn the guitar. Badly. Twice.';
}

function dstr(idx: number): string {
  const d = dateAt(idx);
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
}

function dshort(idx: number): string {
  const d = dateAt(idx);
  return d.getDate() + ' ' + MON[d.getMonth()];
}

function hourLabel(h: number): string {
  const f = (t: number) => (t % 12 === 0 ? 12 : t % 12) + (t < 12 ? 'am' : 'pm');
  return f(h) + '–' + f((h + 1) % 24);
}

/** Human range labels for the current day. A function, not a const: freezing
 *  these at module-import time is what pinned the old build to one date. */
export function dates(): Record<RangeId, string> {
  const t = startOfToday();
  return {
    day: dstr(0),
    week: dshort(6) + ' – ' + dshort(0),
    month: dshort(29) + ' – ' + dshort(0),
    year:
      MON[(t.getMonth() + 1) % 12] + ' ' + (t.getFullYear() - 1) + ' – ' + MON[t.getMonth()] + ' ' + t.getFullYear(),
  };
}

export interface Bucket {
  per: number[];
  tick: string;
  label: string;
}

export function buckets(range: RangeId): Bucket[] {
  checkDayRollover();
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
      const d = dateAt(i);
      out.push({ per: dayByCat(i), tick: range === 'week' ? DOWI[d.getDay()] : String(d.getDate()), label: dstr(i) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const t = startOfToday();
      const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
      const per = CATS.map(() => 0);
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      for (let k = 1; k <= n; k++) {
        const idx = daysBetween(new Date(d.getFullYear(), d.getMonth(), k), t);
        if (idx < 0) continue;
        dayByCat(idx).forEach((v, a) => (per[a] += v));
      }
      out.push({ per, tick: MON[d.getMonth()][0], label: MON[d.getMonth()] + ' ' + d.getFullYear() });
    }
  }
  return out;
}

export function prevTotal(range: RangeId, tr: boolean[]): number {
  checkDayRollover();
  const sum = (per: number[]) => per.reduce((s, v, i) => s + (tr[i] ? v : 0), 0);
  let t = 0;
  if (range === 'day') {
    const cur = currentHour();
    for (let h = 0; h <= cur; h++) t += sum(hourByCat(1, h));
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
  const bk = buckets(range); // checks rollover
  const tot = (per: number[]) => per.reduce((s, v, i) => s + (tr[i] ? v : 0), 0);
  const totals = bk.map((b) => tot(b.per));
  const max = Math.max(1, ...totals);
  const s = sel != null && sel < bk.length ? sel : null;
  const scoped =
    s != null
      ? bk[s].per
      : bk.reduce(
          (a, b) => (b.per.forEach((v, i) => (a[i] += v)), a),
          CATS.map(() => 0)
        );
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
  checkDayRollover();
  return dayByCat(0);
}

export function fourteenDayAvg(catIndex: number): number {
  checkDayRollover();
  let s = 0;
  for (let i = 1; i <= 14; i++) s += dayByCat(i)[catIndex];
  return s / 14;
}

// Groups — other members' days use the same shape as raw()/dayByCat(), with a
// per-category usage scale and a seed so each person gets their own numbers.

// Re-exported so callers get dates from the one clock, not a second copy.
export { dateAt };

export function dayLabel(idx: number): string {
  const d = dateAt(idx);
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
}

/** Your own day (all categories), full day for idx >= 1, so far for today. */
export function myDay(idx: number): number[] {
  return dayByCat(idx);
}

/** Another group member's day. Stays on the demo source: the OS only reports
 *  this device, so real other-people data has to come from a backend. */
export function memberDay(idx: number, scale: number[], seed: number): number[] {
  return demoSource.memberDay(idx, scale, seed);
}

// Penalty limit (simulated ledger — no real money moves). The demo pretends
// the app was installed on INSTALL_DATE with DEMO_PENALTY active ever since;
// every settled day's charge sits in a locked balance until UNLOCK_DATE.

export interface PenaltySetting {
  limit: number; // minutes per day
  rate: number; // dollars per minute over
}

/** How long the demo pretends the app has been installed. Real builds must
 *  persist the true install date at first launch instead (see prefs store). */
export const DEMO_INSTALL_DAYS_AGO = 177;

/** Day the demo ledger starts. Clock-relative so history stays bounded
 *  instead of growing forever against a frozen calendar date. */
export function installDate(): Date {
  return dateAt(DEMO_INSTALL_DAYS_AGO);
}

/** Charges unlock a year after install. */
export function unlockDate(): Date {
  const d = installDate();
  return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
}

// 4h so that "today so far" already shows an overage by mid-evening.
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
  checkDayRollover();
  return dayByCat(0).reduce((s, v, i) => s + (tr[i] ? v : 0), 0);
}

export function daysUntilUnlock(): number {
  return daysBetween(startOfToday(), unlockDate());
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
onDayChange(() => {
  _history = null;
});
/** Settled days, newest first (yesterday back to install day). Past days were
 *  settled with every category tracked, so later toggles don't rewrite them. */
export function chargeHistory(): ChargeDay[] {
  checkDayRollover();
  if (_history) return _history;
  const n = daysBetween(installDate(), startOfToday());
  const out: ChargeDay[] = [];
  let balance = 0;
  for (let idx = n; idx >= 1; idx--) {
    const used = dayByCat(idx).reduce((s, v) => s + v, 0);
    const charge = chargeFor(used, DEMO_PENALTY);
    balance = Math.round((balance + charge) * 100) / 100;
    // dayLabel() rather than dstr(): subtracting 24h steps drifts a day
    // across the March DST change.
    out.push({
      label: dayLabel(idx),
      used,
      over: minutesOver(used, DEMO_PENALTY.limit),
      limit: DEMO_PENALTY.limit,
      charge,
      balance,
    });
  }
  _history = out.reverse();
  return _history;
}
