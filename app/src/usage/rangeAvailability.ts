// Which timeframes the app is allowed to show.
//
// Measured on an SM-S942U (Android 16): the OS retains about 10 days of per-day
// buckets and ~10 days of raw events, but only 6 monthly periods over 161 days.
// A Week view needs 7 days and gets them. A Month view needs 30 and a Year view
// needs 12 whole months, and the OS simply cannot supply either.
//
// The decision taken was progressive unlock: show Day and Week immediately, and
// keep Month and Year hidden until the app's own rollup holds enough real days.
// Not partial charts, not interpolated bars - hidden, then real.
//
// This module is the single place that judgement lives, so the Overview cards,
// the breakdown range tabs and any future export all agree.

import { RangeId } from '../data';

/** Days of genuine history each range needs before it means anything. */
export const DAYS_REQUIRED: Record<RangeId, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export interface RangeStatus {
  id: RangeId;
  available: boolean;
  /** Days of history present, capped at what the range needs. */
  have: number;
  need: number;
  /** Null when available; otherwise what to tell the user. */
  note: string | null;
}

/**
 * Judge every range against the history actually recorded.
 *
 * `daysRecorded` is the count of distinct days in the rollup table, not a span:
 * a user who skips a week has fewer real days than the calendar suggests, and
 * padding the gap with zeros would understate their usage rather than admit the
 * data is missing.
 */
export function rangeAvailability(daysRecorded: number): Record<RangeId, RangeStatus> {
  const judge = (id: RangeId): RangeStatus => {
    const need = DAYS_REQUIRED[id];
    const have = Math.min(daysRecorded, need);
    const available = daysRecorded >= need;
    return {
      id,
      available,
      have,
      need,
      note: available ? null : buildNote(id, daysRecorded, need),
    };
  };
  return { day: judge('day'), week: judge('week'), month: judge('month'), year: judge('year') };
}

function buildNote(id: RangeId, have: number, need: number): string {
  const remaining = Math.max(1, need - have);
  const label = id === 'year' ? 'A year' : id === 'month' ? 'A month' : id === 'week' ? 'A week' : 'A day';
  if (have === 0) return `${label} of history hasn't been recorded yet.`;
  const unit = remaining === 1 ? 'day' : 'days';
  return `${remaining} more ${unit} of tracking and this opens up.`;
}

/** The ranges to offer, in display order, given the history recorded. */
export function availableRanges(daysRecorded: number): RangeId[] {
  const status = rangeAvailability(daysRecorded);
  return (['day', 'week', 'month', 'year'] as RangeId[]).filter((id) => status[id].available);
}

/**
 * The range to open on.
 *
 * Week is the default once it exists because a single day is too noisy to judge
 * a habit by; before that, Day is all there is.
 */
export function defaultRange(daysRecorded: number): RangeId {
  const available = availableRanges(daysRecorded);
  if (available.includes('week')) return 'week';
  return 'day';
}
