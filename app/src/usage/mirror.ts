// Hands the widget and the hourly nudges the history they need.
//
// They run without JS, so they used to read the history database directly,
// with Android's own SQLite. expo-sqlite is a second SQLite in the same
// process, and two SQLite libraries release each other's file locks, which
// corrupted the database on a real phone. Now only expo-sqlite ever opens it:
// after each load (and each background recording) the app sums every day's
// tracked minutes and passes them over, the way it already passes the
// selection (UsageStats.syncTracked).

import { UsageStats } from '../../modules/usage-stats';
import { dateAt, dayStamp } from '../clock';
import { readRange } from './rollupStore';

/** Enough for the widget's longest range: a year, back to the 1st of the month. */
const MIRROR_DAYS = 400;

/** Tracked minutes per day, for the days the history holds. Pure, so tested. */
export function trackedPerDay(
  stored: Record<string, Record<string, number>>,
  tracked: readonly string[]
): Record<string, number> {
  const wanted = new Set(tracked);
  const out: Record<string, number> = {};
  for (const [day, perApp] of Object.entries(stored)) {
    let total = 0;
    for (const [pkg, minutes] of Object.entries(perApp)) {
      if (wanted.has(pkg) && Number.isFinite(minutes)) total += minutes;
    }
    if (total > 0) out[day] = total;
  }
  return out;
}

export async function mirrorHistory(tracked: readonly string[]): Promise<void> {
  const stored = await readRange(dayStamp(dateAt(MIRROR_DAYS - 1)), dayStamp(dateAt(0)));
  UsageStats.syncHistory(trackedPerDay(stored, tracked));
}
