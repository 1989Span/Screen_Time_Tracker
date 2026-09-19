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
// load, so history accumulates without needing a background job. Today is
// recorded too and rewritten as it grows, which the (day, package) primary key
// makes idempotent.

import { InstalledApp, UsageStats } from '../../modules/usage-stats';
import { dayStamp, dateAt, now as clockNow, startOfToday } from '../clock';
import { isCountable, seriesForApps } from './appFilter';
import { dayWindow, hourlyFromEvents } from './hourly';
import { readRange, recordDay } from './rollupStore';
import { Series } from './series';
import { SourceStatus, UsageSource } from './source';

/** Days of raw events to fetch. Events are retained ~10 days; the hourly chart
 *  only ever shows one day, so a short window keeps the query cheap. */
const EVENT_WINDOW_DAYS = 3;

/** How far back to try the OS for per-day totals before falling back to the
 *  rollup. Generous: asking for a day the OS has dropped simply returns nothing. */
const OS_DAILY_PROBE_DAYS = 14;

const MS_PER_MINUTE = 60_000;

export class AndroidUsageStatsSource implements UsageSource {
  readonly id = 'android-usage-stats';

  private _status: SourceStatus = 'idle';
  private tracked: string[] = [];
  private installed = new Map<string, InstalledApp>();

  /** day index -> minutes per series, aligned to `tracked`. */
  private dayCache = new Map<number, number[]>();
  /** `${dayIndex}:${hour}` -> minutes per series. */
  private hourCache = new Map<string, number[]>();

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

      // --- Days the OS can still answer for -------------------------------
      // One query per day: the native call sums buckets across whatever range it
      // is given, so a per-day figure needs a per-day window.
      const osDays = Math.min(days, OS_DAILY_PROBE_DAYS);
      const fresh: { day: string; totals: Record<string, number> }[] = [];
      for (let idx = 0; idx < osDays; idx++) {
        const { start, end } = dayWindow(today, idx, nowMs);
        if (end <= start) continue;
        const raw = await UsageStats.queryTotals(start, end);
        const totals: Record<string, number> = {};
        for (const [pkg, ms] of Object.entries(raw)) {
          if (!isCountable(pkg)) continue;
          const minutes = ms / MS_PER_MINUTE;
          if (minutes > 0) totals[pkg] = minutes;
        }
        // Record even an empty day: "recorded and quiet" must be distinguishable
        // from "never recorded", which is what the coverage gate reads.
        fresh.push({ day: dayStamp(dateAt(idx)), totals });
        this.dayCache.set(idx, this.toSeriesArray(totals));
      }

      // --- Persist, so these days survive the OS forgetting them ----------
      for (const entry of fresh) {
        await recordDay(entry);
      }

      // --- Older days come from our own history ---------------------------
      if (days > osDays) {
        const fromDay = dayStamp(dateAt(days - 1));
        const toDay = dayStamp(dateAt(osDays));
        const stored = await readRange(fromDay, toDay);
        for (let idx = osDays; idx < days; idx++) {
          const totals = stored[dayStamp(dateAt(idx))];
          if (totals) this.dayCache.set(idx, this.toSeriesArray(totals));
        }
      }

      // --- Hourly detail for the recent days the Day view can show --------
      const eventsFrom = dayWindow(today, EVENT_WINDOW_DAYS - 1, nowMs).start;
      const rawEvents = await UsageStats.queryEvents(eventsFrom, nowMs);
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
