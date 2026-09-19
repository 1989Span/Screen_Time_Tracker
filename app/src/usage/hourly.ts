// Turning raw app-switch events into per-hour usage.
//
// UsageStatsManager's aggregate buckets give per-day totals but no finer
// resolution, so the Day view's hourly chart has to be rebuilt from raw
// ACTIVITY_RESUMED / ACTIVITY_PAUSED events. Events are retained about 10 days
// on the device measured, which is plenty for a 24-hour chart.
//
// The awkward parts, all of which this handles explicitly:
//
//  * A session can span an hour boundary, or several. Its time has to be split
//    across the hours it actually covers, not credited to whichever hour it
//    started in - otherwise a two-hour session shows as a single tall bar.
//  * A session can be open at the end of the window (the app is still in the
//    foreground). It runs to the window end, not forever.
//  * Pause events go missing when an app is force-stopped or the process dies.
//    An unmatched resume followed by another app's resume has to be closed, or
//    one app appears to run for days.
//  * Events can arrive out of order, and duplicate resumes happen.

export interface RawEvent {
  packageName: string;
  timeStamp: number;
  resumed: boolean;
}

export interface HourlyUsage {
  /** hour 0-23 -> package -> minutes within that hour. */
  byHour: Record<number, Record<string, number>>;
  /** package -> total minutes over the whole window. */
  totals: Record<string, number>;
}

const HOUR_MS = 3_600_000;

/**
 * Attribute event sessions to the hours they cover.
 *
 * `windowStart`/`windowEnd` bound the day being measured (local midnight to
 * midnight, or to now for today). Sessions are clipped to the window so a
 * session starting yesterday only contributes its portion inside it.
 */
export function hourlyFromEvents(events: RawEvent[], windowStart: number, windowEnd: number): HourlyUsage {
  const byHour: Record<number, Record<string, number>> = {};
  const totals: Record<string, number> = {};

  const credit = (pkg: string, from: number, to: number) => {
    const start = Math.max(from, windowStart);
    const end = Math.min(to, windowEnd);
    if (end <= start) return;
    // Walk hour boundaries so a session spanning several hours is split rather
    // than dumped into the hour it began in.
    let cursor = start;
    while (cursor < end) {
      const hourIndex = new Date(cursor).getHours();
      const nextBoundary = new Date(cursor).setMinutes(60, 0, 0);
      const segmentEnd = Math.min(nextBoundary, end);
      const minutes = (segmentEnd - cursor) / 60_000;
      if (minutes > 0) {
        (byHour[hourIndex] ??= {})[pkg] = ((byHour[hourIndex] ?? {})[pkg] ?? 0) + minutes;
        totals[pkg] = (totals[pkg] ?? 0) + minutes;
      }
      cursor = segmentEnd;
    }
  };

  // Sort defensively: the platform usually returns events in order, but a
  // single out-of-order pair would otherwise produce a negative duration.
  const ordered = [...events].sort((a, b) => a.timeStamp - b.timeStamp);

  // At most one app is in the foreground at a time, so a single open session is
  // enough. A resume for a different package implicitly ends the previous one,
  // which is what covers missing pause events.
  let openPkg: string | null = null;
  let openAt = 0;

  for (const e of ordered) {
    if (!e.packageName) continue;
    if (e.resumed) {
      if (openPkg !== null) credit(openPkg, openAt, e.timeStamp);
      openPkg = e.packageName;
      openAt = e.timeStamp;
    } else {
      // A pause for whatever is open closes it. A pause for something else is
      // stale (its resume predates the window) and is ignored.
      if (openPkg === e.packageName) {
        credit(openPkg, openAt, e.timeStamp);
        openPkg = null;
      }
    }
  }

  // Still foreground at the end of the window.
  if (openPkg !== null) credit(openPkg, openAt, windowEnd);

  return { byHour, totals };
}

/** Per-hour minutes for one package, as a 24-slot array. */
export function hourSeries(usage: HourlyUsage, pkg: string): number[] {
  const out = new Array<number>(24).fill(0);
  for (let h = 0; h < 24; h++) out[h] = usage.byHour[h]?.[pkg] ?? 0;
  return out;
}

/** Local midnight-to-midnight bounds for the day `idx` days before `today`,
 *  clipped to `now` so today never reports future hours. */
export function dayWindow(today: Date, idx: number, now: number): { start: number; end: number } {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - idx).getTime();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - idx + 1).getTime();
  return { start, end: Math.min(end, now) };
}

/** Milliseconds in an hour, exported so callers need not redefine it. */
export { HOUR_MS };
