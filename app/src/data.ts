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

export type RangeId = 'day' | 'week' | 'month' | 'year';

// Re-exported so existing imports keep working; the definitions now live with
// the source layer, because a real source is what decides what a category is.
export { CATS, CCOL };
export type { Cat };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOWI = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAME = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const RANGE_LABEL: Record<RangeId, string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' };

/** The series currently being measured, in the order every per-series array is
 *  indexed. Dynamic: eight demo categories, or however many apps are tracked. */
export function series() {
  return usageSource().series();
}

/** How many series there are. Was CATS.length; never assume 8. */
export function seriesCount(): number {
  return usageSource().series().length;
}

/** A zero-filled accumulator sized to the current series. */
function zeros(): number[] {
  return new Array<number>(seriesCount()).fill(0);
}

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

function dstr(idx: number): string {
  const d = dateAt(idx);
  return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
}

/** "Tuesday, September 29, 2026". Spelled out here rather than left to the
 *  phone's locale, so it reads the same on every device. */
export function longDate(d: Date): string {
  return DAY_NAME[d.getDay()] + ', ' + MONTH_NAME[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function hourLabel(h: number): string {
  const f = (t: number) => (t % 12 === 0 ? 12 : t % 12) + (t < 12 ? 'am' : 'pm');
  return f(h) + '–' + f((h + 1) % 24);
}

// --- Calendar ranges -----------------------------------------------------------
// Every range is a calendar period: Day is today, Week runs Sunday to Saturday,
// Month is the calendar month and Year the calendar year. Totals cover the
// period so far; charts show the whole period, with days still to come empty.
// Each is compared with the same days of the period before.

/** How far back history reaches (rollupStore prunes older days), so a comparison
 *  reaching further would be measured against days that no longer exist. */
const HISTORY_DAYS = 400;

const day0 = () => startOfToday();
const at = (y: number, m: number, d: number) => new Date(y, m, d);
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** First and last day of the period a range covers now. The last may be ahead of today. */
export function rangeSpan(range: RangeId): { first: Date; last: Date } {
  const t = day0();
  const y = t.getFullYear();
  const m = t.getMonth();
  if (range === 'week') {
    const first = at(y, m, t.getDate() - t.getDay());
    return { first, last: at(first.getFullYear(), first.getMonth(), first.getDate() + 6) };
  }
  if (range === 'month') return { first: at(y, m, 1), last: at(y, m, daysIn(y, m)) };
  if (range === 'year') return { first: at(y, 0, 1), last: at(y, 11, 31) };
  return { first: t, last: t };
}

/** Days of the period up to and including today: what a daily average divides by. */
export function daysSoFar(range: RangeId): number {
  return daysBetween(rangeSpan(range).first, day0()) + 1;
}

/** The same days of the period before, or null when history can't reach them. */
function previousSpan(range: RangeId): { first: Date; last: Date } | null {
  const t = day0();
  const y = t.getFullYear();
  const m = t.getMonth();
  const d = t.getDate();
  let span: { first: Date; last: Date };
  if (range === 'week') {
    const first = rangeSpan('week').first;
    span = { first: at(first.getFullYear(), first.getMonth(), first.getDate() - 7), last: at(y, m, d - 7) };
  } else if (range === 'month') {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    span = { first: at(py, pm, 1), last: at(py, pm, Math.min(d, daysIn(py, pm))) };
  } else {
    span = { first: at(y - 1, 0, 1), last: at(y - 1, m, Math.min(d, daysIn(y - 1, m))) };
  }
  return daysBetween(span.first, t) <= HISTORY_DAYS ? span : null;
}

/** Day indexes (days before today) from `first` to `last`, skipping any after today. */
function idxsBetween(first: Date, last: Date): number[] {
  const t = day0();
  const out: number[] = [];
  for (let k = daysBetween(first, t); k >= daysBetween(last, t); k--) if (k >= 0) out.push(k);
  return out;
}

const dayLabelOf = (d: Date) => DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];

/** Human range labels for the current day. A function, not a const: freezing
 *  these at module-import time is what pinned the old build to one date. */
export function dates(): Record<RangeId, string> {
  const t = day0();
  const { first, last } = rangeSpan('week');
  const week =
    first.getMonth() === last.getMonth()
      ? first.getDate() + ' – ' + last.getDate() + ' ' + MON[last.getMonth()]
      : first.getDate() + ' ' + MON[first.getMonth()] + ' – ' + last.getDate() + ' ' + MON[last.getMonth()];
  return {
    day: dstr(0),
    week,
    month: MONTH_NAME[t.getMonth()] + ' ' + t.getFullYear(),
    year: String(t.getFullYear()),
  };
}

export interface Bucket {
  per: number[];
  tick: string;
  label: string;
  /** Shown under the chart when this bar is tapped: an hour range, a full date, or a month. */
  name: string;
}

/** The days of the current week or month as chart bars, oldest first. */
function periodDays(range: 'week' | 'month'): Date[] {
  const { first, last } = rangeSpan(range);
  const out: Date[] = [];
  for (let k = 0; k <= daysBetween(first, last); k++) {
    out.push(at(first.getFullYear(), first.getMonth(), first.getDate() + k));
  }
  return out;
}

/** The calendar year's twelve months, each with the day indexes it covers so far. */
function yearMonths(): { d: Date; idxs: number[] }[] {
  const y = day0().getFullYear();
  return Array.from({ length: 12 }, (_, m) => ({
    d: at(y, m, 1),
    idxs: idxsBetween(at(y, m, 1), at(y, m, daysIn(y, m))),
  }));
}

export function buckets(range: RangeId): Bucket[] {
  checkDayRollover();
  const out: Bucket[] = [];
  const t = day0();
  if (range === 'day') {
    for (let h = 0; h < 24; h++) {
      out.push({
        per: hourByCat(0, h),
        tick: h % 6 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : (h % 12) + (h < 12 ? 'a' : 'p')) : '',
        label: hourLabel(h) + ', today',
        name: hourLabel(h),
      });
    }
  } else if (range === 'week' || range === 'month') {
    for (const d of periodDays(range)) {
      const idx = daysBetween(d, t);
      out.push({
        // Days still to come have nothing yet.
        per: idx >= 0 ? dayByCat(idx) : zeros(),
        tick: range === 'week' ? DOWI[d.getDay()] : String(d.getDate()),
        label: dayLabelOf(d),
        name: longDate(d),
      });
    }
  } else {
    for (const { d, idxs } of yearMonths()) {
      const per = zeros();
      for (const idx of idxs) dayByCat(idx).forEach((v, a) => (per[a] += v));
      out.push({
        per,
        tick: MON[d.getMonth()][0],
        label: MON[d.getMonth()] + ' ' + d.getFullYear(),
        name: MONTH_NAME[d.getMonth()] + ' ' + d.getFullYear(),
      });
    }
  }
  return out;
}

/** The same span of the period before: yesterday up to this hour, or the same
 *  days of last week, month or year. Zero when history doesn't reach that far. */
export function prevTotal(range: RangeId): number {
  checkDayRollover();
  const sum = (per: number[]) => per.reduce((s, v) => s + v, 0);
  let t = 0;
  if (range === 'day') {
    const cur = currentHour();
    for (let h = 0; h <= cur; h++) t += sum(hourByCat(1, h));
    return t;
  }
  const span = previousSpan(range);
  if (!span) return 0;
  for (const idx of idxsBetween(span.first, span.last)) t += sum(dayByCat(idx));
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

// Every series the source returns is, by definition, one the user selected:
// androidSource.setTracked() decides what exists before any of this runs. There
// is deliberately no "which of these count?" mask here - one used to exist, sized
// to the eight legacy categories, and it silently dropped every app past index 7
// once selection became per-app.
export function slice(range: RangeId, sel: number | null): Slice {
  const bk = buckets(range); // checks rollover
  const tot = (per: number[]) => per.reduce((s, v) => s + v, 0);
  const totals = bk.map((b) => tot(b.per));
  const max = Math.max(1, ...totals);
  const s = sel != null && sel < bk.length ? sel : null;
  const scoped = s != null ? bk[s].per : bk.reduce((a, b) => (b.per.forEach((v, i) => (a[i] += v)), a), zeros());
  const total = tot(scoped);
  const ser = series();
  const order = ser
    .map((_, i) => i)
    .filter((i) => scoped[i] > 0.4)
    .sort((x, y) => scoped[y] - scoped[x]);
  const topV = order.length ? scoped[order[0]] : 1;
  const rows: SliceRow[] = order.map((i) => ({
    name: ser[i].name,
    time: fmt(scoped[i]),
    pct: Math.max(2, (scoped[i] / topV) * 100),
    share: Math.round((scoped[i] / Math.max(1, total)) * 100) + '%',
    ci: i,
    tone: ser[i].color,
  }));
  return { bk, totals, max, sel: s, scoped, total, order, rows };
}

// --- Unlocks -------------------------------------------------------------------
// How often the phone was unlocked, for the user's own view. Groups never read
// these: a group compares screen time only.

/** Whether unlock counts can be shown: the source counts them, on an Android
 *  version that records them. Otherwise the UI shows none rather than zeros. */
export function countsUnlocks(): boolean {
  const s = usageSource();
  return s.unlocksDay !== undefined && (s.countsUnlocks?.() ?? false);
}

const unlocksDay = (idx: number) => usageSource().unlocksDay?.(idx) ?? 0;
const unlocksHour = (idx: number, h: number) => usageSource().unlocksHour?.(idx, h) ?? 0;

/** Unlocks per bar, in the same order as buckets(range), so a tapped bar's index works for both. */
export function unlockBuckets(range: RangeId): number[] {
  checkDayRollover();
  if (range === 'day') return Array.from({ length: 24 }, (_, h) => unlocksHour(0, h));
  if (range === 'week' || range === 'month') {
    const t = day0();
    return periodDays(range).map((d) => {
      const idx = daysBetween(d, t);
      return idx >= 0 ? unlocksDay(idx) : 0;
    });
  }
  return yearMonths().map(({ idxs }) => idxs.reduce((s, idx) => s + unlocksDay(idx), 0));
}

/** Unlocks over the same span of the period before, matching prevTotal(). */
export function prevUnlocks(range: RangeId): number {
  checkDayRollover();
  let t = 0;
  if (range === 'day') {
    const cur = currentHour();
    for (let h = 0; h <= cur; h++) t += unlocksHour(1, h);
    return t;
  }
  const span = previousSpan(range);
  if (!span) return 0;
  for (const idx of idxsBetween(span.first, span.last)) t += unlocksDay(idx);
  return t;
}

/** "1 unlock", "48 unlocks", "1,204 unlocks". */
export function fmtUnlocks(n: number): string {
  const whole = Math.round(n);
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (whole === 1 ? ' unlock' : ' unlocks');
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

/** Per-series usage for the day `idx` days before today. */
export function dayUsageAt(idx: number): number[] {
  checkDayRollover();
  return dayByCat(idx);
}

// Penalty limit. No real money moves: this is a ledger the app keeps against the
// user's own recorded usage.
//
// Charges only exist for days that were actually recorded, and only from the day
// the user switched the penalty on - the app does not know what the limit would
// have been before that, and applying today's setting backwards would invent a
// debt that was never incurred.

export interface PenaltySetting {
  limit: number; // minutes per day
  rate: number; // dollars per minute over
}

/** What the editor starts on when the user has never set a limit. A starting
 *  point for a form, not a charge: nothing accrues until they save it. */
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

export function trackedToday(): number {
  checkDayRollover();
  return dayByCat(0).reduce((s, v) => s + v, 0);
}
