// Copies usage out of the OS and into the app's own history.
//
// Deliberately free of React, stores and the current selection:
//
//  * It runs headless from a background task, where no store has hydrated.
//  * It records *every* countable package, not just the tracked ones. Selection
//    filters at read time. If it filtered here, adding an app later would find no
//    history for it, and the user would have to wait weeks for data the OS could
//    have given us all along.
//
// Why days come from events, not from queryUsageStats
// ---------------------------------------------------
// UsageStatsManager's INTERVAL_DAILY buckets are NOT aligned to midnight. They
// are aligned to the device's own rollover moment - on the device measured, the
// daily bucket ran 9/21 7:16pm to 9/22 7:11pm. Asking that API for "local
// midnight to local midnight" and summing totalTimeInForeground therefore
// attributes a bucket's whole span to whichever calendar day the query happened
// to overlap, mixing yesterday evening into today.
//
// Raw events carry real timestamps, so a session can be clipped to an actual
// local day - including one that spans midnight, which is split rather than
// credited whole to either side. hourlyFromEvents already does exactly that for
// the hourly chart, so days and hours now come from one source and cannot
// disagree.
//
// queryTotals survives only as a fallback for when the device reports no events
// at all. Its numbers are bucket-shifted, so it is used only when the accurate
// path has nothing to offer.

import { UsageStats } from '../../modules/usage-stats';
import { RawEvent, dayWindow, hourlyFromEvents } from './hourly';
import { dateAt, dayStamp, now as clockNow, startOfToday } from '../clock';
import { isCountable } from './appFilter';
import { recordDay } from './rollupStore';

const MS_PER_MINUTE = 60_000;

/**
 * How many days back to ask the OS for.
 *
 * Measured retention on the test device was ~10 days for both daily buckets and
 * raw events, so 14 deliberately overshoots: asking for a day the OS has dropped
 * simply returns nothing, and over-reaching costs one cheap query rather than
 * losing a day.
 */
export const OS_RECORD_DAYS = 14;

export interface RecordResult {
  daysRecorded: number;
  packagesSeen: number;
  /** Events fetched for the window; reused by the source so it need not re-query. */
  events: RawEvent[];
  /** Which path produced the day totals, for diagnostics. */
  source: 'events' | 'daily-buckets' | 'none';
  skipped: 'no-permission' | null;
}

const countable = (totals: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [pkg, minutes] of Object.entries(totals)) {
    if (!isCountable(pkg)) continue;
    if (Number.isFinite(minutes) && minutes > 0) out[pkg] = minutes;
  }
  return out;
};

/**
 * Record the days the OS can still account for.
 *
 * Safe to call repeatedly: the rollup is keyed by (day, package) and replaces a
 * day only when there is data for it, so re-recording rewrites today's growing
 * total without ever erasing an older day.
 */
export async function recordOsDays(days: number = OS_RECORD_DAYS): Promise<RecordResult> {
  if (!UsageStats.hasPermission()) {
    return { daysRecorded: 0, packagesSeen: 0, events: [], source: 'none', skipped: 'no-permission' };
  }

  const today = startOfToday();
  const nowMs = clockNow().getTime();
  const span = Math.max(1, Math.min(days, OS_RECORD_DAYS));
  const seen = new Set<string>();
  let daysRecorded = 0;

  // One events query covers the whole window; per-day slicing happens locally.
  const windowStart = dayWindow(today, span - 1, nowMs).start;
  let events: RawEvent[] = [];
  try {
    events = await UsageStats.queryEvents(windowStart, nowMs);
  } catch {
    // Fall through to the bucket path rather than failing the whole record.
    events = [];
  }

  const useEvents = events.length > 0;

  for (let idx = 0; idx < span; idx++) {
    const { start, end } = dayWindow(today, idx, nowMs);
    if (end <= start) continue;

    let totals: Record<string, number>;
    if (useEvents) {
      totals = countable(hourlyFromEvents(events, start, end).totals);
    } else {
      // Bucket-shifted, but better than no history at all on a device that
      // keeps no events.
      const raw = await UsageStats.queryTotals(start, end);
      const minutes: Record<string, number> = {};
      for (const [pkg, ms] of Object.entries(raw)) minutes[pkg] = ms / MS_PER_MINUTE;
      totals = countable(minutes);
    }

    for (const pkg of Object.keys(totals)) seen.add(pkg);
    // An empty day is still recorded as *observed* - recordDay no longer treats
    // that as licence to delete what is already stored.
    await recordDay({ day: dayStamp(dateAt(idx)), totals });
    daysRecorded++;
  }

  return {
    daysRecorded,
    packagesSeen: seen.size,
    events,
    source: useEvents ? 'events' : daysRecorded > 0 ? 'daily-buckets' : 'none',
    skipped: null,
  };
}
