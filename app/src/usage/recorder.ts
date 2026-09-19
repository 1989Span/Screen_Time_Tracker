// Copies usage out of the OS and into the app's own history.
//
// Deliberately free of React, stores and the current selection:
//
//  * It runs headless from a background task, where no store has hydrated.
//  * It records *every* countable package, not just the tracked ones. Selection
//    filters at read time. If it filtered here, adding an app later would find no
//    history for it, and the user would have to wait weeks for data that the OS
//    could have given us all along.

import { UsageStats } from '../../modules/usage-stats';
import { dateAt, dayStamp, now as clockNow, startOfToday } from '../clock';
import { isCountable } from './appFilter';
import { dayWindow } from './hourly';
import { recordDay } from './rollupStore';

const MS_PER_MINUTE = 60_000;

/**
 * How many days back to ask the OS for.
 *
 * Measured retention on the test device was ~10 days of daily buckets, so 14 is
 * deliberately past the edge: asking for a day the OS has dropped simply returns
 * nothing, and over-reaching costs one cheap query rather than losing a day.
 */
export const OS_RECORD_DAYS = 14;

export interface RecordResult {
  daysRecorded: number;
  packagesSeen: number;
  skipped: 'no-permission' | null;
}

/**
 * Record the days the OS can still account for.
 *
 * Safe to call repeatedly: the rollup is keyed by (day, package), so re-recording
 * replaces rather than accumulates - which is what makes it correct to rewrite
 * today's total as it grows.
 */
export async function recordOsDays(days: number = OS_RECORD_DAYS): Promise<RecordResult> {
  if (!UsageStats.hasPermission()) {
    return { daysRecorded: 0, packagesSeen: 0, skipped: 'no-permission' };
  }

  const today = startOfToday();
  const nowMs = clockNow().getTime();
  const seen = new Set<string>();
  let daysRecorded = 0;

  for (let idx = 0; idx < days; idx++) {
    const { start, end } = dayWindow(today, idx, nowMs);
    if (end <= start) continue;

    const raw = await UsageStats.queryTotals(start, end);
    const totals: Record<string, number> = {};
    for (const [pkg, ms] of Object.entries(raw)) {
      if (!isCountable(pkg)) continue;
      const minutes = ms / MS_PER_MINUTE;
      if (minutes > 0) {
        totals[pkg] = minutes;
        seen.add(pkg);
      }
    }

    // Recorded even when empty: "recorded and quiet" has to be distinguishable
    // from "never recorded", because the latter is what the coverage count means.
    await recordDay({ day: dayStamp(dateAt(idx)), totals });
    daysRecorded++;
  }

  return { daysRecorded, packagesSeen: seen.size, skipped: null };
}
