// The app's single source of "now".
//
// Everything date-shaped in the app derives from here rather than calling
// `new Date()` directly, for three reasons:
//
//  1. Tests and the demo dataset can pin the clock to a fixed instant, so
//     generated numbers and snapshots stay stable.
//  2. Day-scoped caches can invalidate themselves when the date rolls over.
//     Usage data is cached by "days before today", so if today changes while
//     the app is open, every cached index silently means the wrong day.
//  3. Date arithmetic lives in one place and stays DST-safe. Stepping by
//     86_400_000ms drifts a whole day across a DST transition; stepping by
//     calendar fields does not.

export type ClockSource = () => Date;

const systemClock: ClockSource = () => new Date();
let source: ClockSource = systemClock;

/** Current instant, from whichever clock is installed. */
export function now(): Date {
  return source();
}

/** Midnight at the start of today, local time. */
export function startOfToday(): Date {
  const n = source();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Hour of the day, 0–23. Usage "so far today" stops here. */
export function currentHour(): number {
  return source().getHours();
}

/** The calendar date `idx` days before today.
 *  Calendar arithmetic, not 24h subtraction, so it survives DST. */
export function dateAt(idx: number): Date {
  const n = source();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() - idx);
}

/** Whole days from `from` to `to`, DST-safe (compares calendar dates, so a
 *  23h or 25h day still counts as one day). */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

// --- Day-rollover invalidation -------------------------------------------
// Caches keyed by "days before today" are only valid for one calendar day.
// Register them here; public data-layer entry points call checkDayRollover().

const invalidators: (() => void)[] = [];
let dayStart = Number.NaN;
let dayEnd = Number.NaN;

/** Register a cache to be cleared whenever the calendar day changes. */
export function onDayChange(clear: () => void): void {
  invalidators.push(clear);
}

/** Clear day-scoped caches if the date has rolled over since the last check.
 *  Cheap on the hot path: two numeric comparisons unless the day changed. */
export function checkDayRollover(): void {
  const t = source().getTime();
  if (t >= dayStart && t < dayEnd) return;
  const n = source();
  dayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  dayEnd = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime();
  for (const clear of invalidators) clear();
}

// --- Test / demo control -------------------------------------------------

/** Pin the clock to a fixed instant. Returns a function restoring the system
 *  clock, so tests can `const restore = setFixedClock(d); ... restore();`. */
export function setFixedClock(instant: Date): () => void {
  const frozen = new Date(instant.getTime());
  source = () => new Date(frozen.getTime());
  invalidate();
  return useSystemClock;
}

/** Install an arbitrary clock (e.g. one the test advances by hand). */
export function setClock(fn: ClockSource): void {
  source = fn;
  invalidate();
}

/** Back to the real device clock. */
export function useSystemClock(): void {
  source = systemClock;
  invalidate();
}

/** Force every day-scoped cache to drop, regardless of the date. */
export function invalidate(): void {
  dayStart = Number.NaN;
  dayEnd = Number.NaN;
  for (const clear of invalidators) clear();
}
