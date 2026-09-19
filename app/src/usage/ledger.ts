// Small helpers for turning a stored day stamp back into dates and spans.
//
// The penalty ledger is anchored to the day the user switched a limit on, which is
// persisted as a `YYYY-MM-DD` stamp. These convert that back without going near a
// timezone offset, because the stamp is local-calendar by construction.

import { daysBetween, startOfToday } from '../clock';

/** Parse a `YYYY-MM-DD` stamp as a local calendar date at midnight. */
export function dayStampToDate(stamp: string): Date {
  const [y, m, d] = stamp.split('-').map((n) => Number(n));
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Whole days from a stamp up to today, or 0 for an empty/unparseable stamp.
 *
 * Used to bound the ledger: a penalty switched on three days ago can only have
 * charged for three days, whatever usage history exists behind it.
 */
export function daysSinceStamp(stamp: string): number {
  if (stamp === '') return 0;
  const start = dayStampToDate(stamp);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, daysBetween(start, startOfToday()));
}
