// Real Android screen time, behind the UsageSource interface.
//
// Shape of the problem
// -------------------
// The interface promises synchronous reads, because the view models call slice()
// inside useMemo. UsageStatsManager is a JNI call. So load() does all the I/O and
// fills an in-memory cache, and the reads below only ever serve that cache. A
// read for a day that was never loaded returns zeros rather than throwing - which
// is safe because rangeAvailability decides what the UI is allowed to ask for.
//
// Where the numbers come from
// --------------------------
// Two sources, merged, because neither is sufficient alone:
//
//   * The OS, for days still inside its retention (~10 on the device measured).
//     Authoritative, and it handles the edge cases of its own accounting.
//   * The app's own rollup table, for everything older. The OS has forgotten
//     those days; we wrote them down while it still knew.
//
// Every day the OS can still answer for is re-recorded into the rollup on each
// load, and a background task does the same while the app is closed so a fortnight
// away does not lose those days. Today is recorded too and rewritten as it grows,
// which the (day, package) primary key makes idempotent.
//
// Reads go through the rollup rather than the freshly-queried values, so recent
// and old days travel one code path and cannot disagree.

import { InstalledApp, UsageStats } from '../../modules/usage-stats';
import { dayStamp, dateAt, now as clockNow, startOfToday } from '../clock';
import { isCountable, seriesForApps } from './appFilter';
import { dayWindow, hourlyFromEvents } from './hourly';
import { OS_RECORD_DAYS, recordOsDays } from './recorder';
import { readRange } from './rollupStore';
import { Series } from './series';
import { SourceStatus, UsageSource } from './source';

/** Days of raw events to fetch. Events are retained ~10 days; the hourly chart
 *  only ever shows one day, so a short window keeps the query cheap. */
const EVENT_WINDOW_DAYS = 3;

export class AndroidUsageStatsSource implements UsageSource {
  readonly id = 'android-usage-stats';

  private _status: SourceStatus = 'idle';
  private tracked: string[] = [];
  private installed = new Map<string, InstalledApp>();

  /** day index -> minutes per series, aligned to `tracked`. */
  private dayCache = new Map<number, number[]>();
  /** `${dayIndex}:${hour}` -> minutes per series. */
  private hourCache = new Map<string, number[]>();
  /**
   * day stamp -> package -> minutes, for every recorded app. Keyed by stamp, not
   * by "days before today", so unlike the caches above it keeps its meaning at
   * midnight and isn't cleared by invalidate(). It doesn't depend on the
   * selection either.
   */
  private allDays: Record<string, Record<string, number>> = {};

  /** True when hourly figures were spread from a daily total rather than derived
   *  from real events, so the UI can say so instead of implying precision. */
  hourlyIsApproximate = false;

  get status(): SourceStatus {
    return this._status;
  }

  series(): Series[] {
    return seriesForApps(this.tracked, this.installed);
  }

  /** The user's selection defines both what is counted and the series order, so
   *  changing it invalidates every cached array. */
  setTracked(packages: string[], installed: InstalledApp[]): void {
    this.tracked = packages.filter(isCountable);
    this.installed = new Map(installed.map((a) => [a.packageName, a]));
    this.invalidate();
  }

  invalidate(): void {
    this.dayCache.clear();
    this.hourCache.clear();
  }

  allAppsDay(stamp: string): Record<string, number> {
    return { ...(this.allDays[stamp] ?? {}) };
  }

  private toSeriesArray(totals: Record<string, number>): number[] {
    return this.tracked.map((pkg) => totals[pkg] ?? 0);
  }

  async load(days: number): Promise<void> {
    if (!UsageStats.hasPermission()) {
      this._status = 'denied';
      return;
    }
    this._status = 'loading';
    try {
      const today = startOfToday();
      const nowMs = clockNow().getTime();

      // --- Copy what the OS still knows into our own history --------------
      // Shared with the background task, and it records every countable package
      // rather than only the tracked ones, so adding an app later already has
      // history behind it. It hands back the events it fetched so the hourly
      // chart below reuses them instead of querying twice - and so hours and
      // days are derived from exactly the same data.
      const osDays = Math.min(days, OS_RECORD_DAYS);
      const recorded = await recordOsDays(osDays);

      // --- Read every day back out of the rollup --------------------------
      // Reading through the rollup rather than keeping the freshly-queried values
      // means one code path serves both recent and old days, so there is no seam
      // where the two could disagree.
      const stored = await readRange(dayStamp(dateAt(days - 1)), dayStamp(dateAt(0)));
      this.allDays = stored;
      for (let idx = 0; idx < days; idx++) {
        const totals = stored[dayStamp(dateAt(idx))];
        if (totals) this.dayCache.set(idx, this.toSeriesArray(totals));
      }

      // --- Hourly detail for the recent days the Day view can show --------
      // Reuses the events the recorder already fetched. Previously this issued
      // its own queryEvents call *after* the day totals were cached, so anything
      // that failed here left Week populated and Day stuck at zero - which is
      // exactly how the Day card read 0m while the OS held 74 minutes.
      const rawEvents = recorded.events;
      for (let idx = 0; idx < EVENT_WINDOW_DAYS; idx++) {
        const { start, end } = dayWindow(today, idx, nowMs);
        if (end <= start) continue;
        const usage = hourlyFromEvents(rawEvents, start, end);
        for (let h = 0; h < 24; h++) {
          const perPkg = usage.byHour[h];
          if (!perPkg) continue;
          this.hourCache.set(`${idx}:${h}`, this.toSeriesArray(perPkg));
        }
      }

      // Events can be missing entirely (a device that keeps none, or a query
      // that failed). Rather than leave the Day chart blank while Week shows
      // real numbers, fall back to spreading the day's recorded total evenly
      // across the hours that have happened - flagged as approximate, because
      // pretending to hour-level precision we do not have would be worse.
      if (rawEvents.length === 0) {
        this.hourlyIsApproximate = true;
        for (let idx = 0; idx < EVENT_WINDOW_DAYS; idx++) {
          const dayTotal = this.dayCache.get(idx);
          if (!dayTotal) continue;
          const hoursElapsed = idx === 0 ? new Date(nowMs).getHours() + 1 : 24;
          for (let h = 0; h < hoursElapsed; h++) {
            this.hourCache.set(
              `${idx}:${h}`,
              dayTotal.map((v) => v / hoursElapsed)
            );
          }
        }
      } else {
        this.hourlyIsApproximate = false;
      }

      this._status = 'ready';
    } catch (e) {
      // A query can fail if access is revoked mid-session. Report it rather than
      // silently serving stale or zeroed numbers as if they were real.
      this._status = UsageStats.hasPermission() ? 'unavailable' : 'denied';
      throw e;
    }
  }

  private zeros(): number[] {
    return new Array<number>(this.tracked.length).fill(0);
  }

  dayTotals(idx: number): number[] {
    const hit = this.dayCache.get(idx);
    return hit ? hit.slice() : this.zeros();
  }

  hourTotals(idx: number, h: number): number[] {
    const hit = this.hourCache.get(`${idx}:${h}`);
    return hit ? hit.slice() : this.zeros();
  }
}

export const androidSource = new AndroidUsageStatsSource();
