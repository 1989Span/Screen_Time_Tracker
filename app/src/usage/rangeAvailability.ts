// How complete each timeframe is, and what to say about it.
//
// Measured on an SM-S942U (Android 16): the OS retains about 10 days of per-day
// buckets and ~10 days of raw events, but only 6 monthly periods over 161 days.
// So a Month view wanting 30 days and a Year view wanting 365 cannot be filled
// from the OS alone - the app's own rollup accumulates the rest over time.
//
// Every range stays on screen while that happens. A month-to-date chart built
// from 12 recorded days is useful; what would not be acceptable is presenting it
// as if it were a complete month. So the numbers shown are always real, and the
// shortfall is stated rather than hidden or padded with zeros.

import { RangeId } from '../data';

/** Days of history each range covers when complete. */
export const DAYS_REQUIRED: Record<RangeId, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export interface RangeStatus {
  id: RangeId;
  /** Always true: every range is shown. Kept so callers read intent, not a constant. */
  visible: boolean;
  /** True once history covers the whole span. */
  complete: boolean;
  /** Days of real history inside this range, capped at what it spans. */
  have: number;
  need: number;
  /** Null when complete; otherwise how partial the figure is. */
  note: string | null;
}

/**
 * Judge each range against the history actually recorded.
 *
 * `daysRecorded` counts distinct recorded days, not elapsed ones: a user who
 * tracked 5 days, stopped for a month, then tracked 2 more has 7 real days.
 * Treating the gap as zeros would understate their usage and invent data.
 */
export function rangeAvailability(daysRecorded: number): Record<RangeId, RangeStatus> {
  const judge = (id: RangeId): RangeStatus => {
    const need = DAYS_REQUIRED[id];
    const have = Math.min(daysRecorded, need);
    const complete = daysRecorded >= need;
    return { id, visible: true, complete, have, need, note: complete ? null : partialNote(id, have, need) };
  };
  return { day: judge('day'), week: judge('week'), month: judge('month'), year: judge('year') };
}

/** Says plainly how much of the range is real, so a partial chart cannot be
 *  mistaken for a complete one. */
function partialNote(id: RangeId, have: number, need: number): string {
  if (have === 0) return 'No history recorded yet';
  const span = id === 'year' ? 'year' : id === 'month' ? 'month' : id === 'week' ? 'week' : 'day';
  return `${have} of ${need} days recorded · ${span} so far`;
}

/** Every range, always. Month and year fill in as history accumulates. */
export function availableRanges(): RangeId[] {
  return ['day', 'week', 'month', 'year'];
}

/**
 * The range to open on.
 *
 * Week once there is a week of history, because a single day is too noisy to
 * judge a habit by; Day before that, since it is the only complete thing.
 */
export function defaultRange(daysRecorded: number): RangeId {
  return daysRecorded >= DAYS_REQUIRED.week ? 'week' : 'day';
}
