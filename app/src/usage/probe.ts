// Device diagnostics for the Android usage-stats API.
//
// Two things about UsageStatsManager cannot be looked up, only measured:
//
//  1. How far back this particular device retains data. The documented figures
//     are approximate and vary by OEM, and the app's Month and Year views are
//     only meaningful if the data reaches that far.
//  2. How useful Android's own app categories are here. On the first device
//     tested, 47% of launchable apps declared CATEGORY_UNDEFINED, which is why
//     tracking is per app rather than per inferred category.
//
// Dev-only: called behind __DEV__ from index.ts and logged, never shipped as UI.

import { UsageStats } from '../../modules/usage-stats';
import { coverage, forgetDay, readDay, recordDay, sumByPackage } from './rollupStore';
import { dateAt, dayStamp } from '../clock';
import { AndroidUsageStatsSource } from './androidSource';
import { usageSource } from './source';

const DAY_MS = 86_400_000;

/** expo-sqlite rejects with an opaque message and the real reason in `cause`. */
function describe(e: unknown): string {
  const parts: string[] = [String(e)];
  let cur: unknown = e;
  for (let depth = 0; depth < 4; depth++) {
    const cause = (cur as { cause?: unknown } | null)?.cause;
    if (cause === undefined || cause === null) break;
    parts.push('caused by: ' + String(cause));
    cur = cause;
  }
  const code = (e as { code?: unknown } | null)?.code;
  if (code !== undefined) parts.push('code=' + String(code));
  return parts.join(' | ');
}

export interface ProbeReport {
  granted: boolean;
  apps: { total: number; launchable: number; userInstalled: number };
  /** Android ApplicationInfo.category -> count, over launchable apps. */
  categoryHistogram: Record<string, number>;
  retention?: Record<string, { spanDays: number; periods: number; packages: number }>;
  topApps?: { packageName: string; minutes: number }[];
}

export async function probeDevice(): Promise<ProbeReport> {
  const granted = UsageStats.hasPermission();
  const apps = await UsageStats.installedApps();
  const launchable = apps.filter((a) => a.hasLauncherIcon);

  const categoryHistogram: Record<string, number> = {};
  for (const a of launchable) {
    const key = String(a.category);
    categoryHistogram[key] = (categoryHistogram[key] ?? 0) + 1;
  }

  const report: ProbeReport = {
    granted,
    apps: {
      total: apps.length,
      launchable: launchable.length,
      userInstalled: apps.filter((a) => !a.isSystem).length,
    },
    categoryHistogram,
  };

  if (!granted) return report;

  const raw = await UsageStats.probeRetention();
  report.retention = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [
      k,
      { spanDays: Math.round(v.spanDays * 10) / 10, periods: v.distinctPeriods, packages: v.packages },
    ])
  );

  const now = Date.now();
  const totals = await UsageStats.queryTotals(now - 7 * DAY_MS, now);
  report.topApps = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([packageName, ms]) => ({ packageName, minutes: Math.round(ms / 60_000) }));

  return report;
}

/** Runs the probe and prints it to the log. Safe to call when access is not
 *  granted: it reports what it can and skips what needs permission. */
export async function logDeviceProbe(): Promise<void> {
  try {
    const r = await probeDevice();
    console.log('[PROBE] granted=' + r.granted);
    console.log(`[PROBE] apps total=${r.apps.total} launchable=${r.apps.launchable} user=${r.apps.userInstalled}`);
    console.log('[PROBE] categories ' + JSON.stringify(r.categoryHistogram));
    if (r.retention) {
      for (const [k, v] of Object.entries(r.retention)) {
        console.log(`[PROBE] ${k}: spanDays=${v.spanDays} periods=${v.periods} packages=${v.packages}`);
      }
    }
    if (r.topApps) console.log('[PROBE] top apps 7d ' + JSON.stringify(r.topApps));
  } catch (e) {
    console.log('[PROBE] failed: ' + String(e));
  }
}

/**
 * Exercises the SQLite rollup table against the real engine on the device.
 *
 * The SQL is stubbed under jest on purpose - a hand-written fake SQL engine would
 * prove nothing about SQLite - so this is where it actually gets verified: write,
 * read back, aggregate, confirm idempotence, and check the coverage count that
 * gates the Month and Year views.
 */
export async function verifyRollupStore(): Promise<void> {
  const tag = '[ROLLUP]';
  try {
    const day = '1970-01-02'; // far outside any real range, so it cannot pollute history
    const other = '1970-01-03';

    await recordDay({ day, totals: { 'test.a': 12.5, 'test.b': 30 } });
    const back = await readDay(day);
    console.log(`${tag} wrote 2 apps, read back ${JSON.stringify(back)}`);

    // Re-recording the same day must replace, not accumulate: today's total is
    // rewritten on every load as it grows.
    await recordDay({ day, totals: { 'test.a': 99 } });
    const after = await readDay(day);
    const replaced = after['test.a'] === 99 && after['test.b'] === undefined;
    console.log(`${tag} re-record replaces rather than accumulates: ${replaced}`);

    await recordDay({ day: other, totals: { 'test.a': 1 } });
    const summed = await sumByPackage(day, other);
    console.log(`${tag} SUM across 2 days: ${JSON.stringify(summed)} (expect test.a=100)`);

    const cov = await coverage();
    console.log(`${tag} coverage days=${cov.days} oldest=${cov.oldest} newest=${cov.newest}`);

    // Clean up the synthetic rows so they never reach a real chart.
    //
    // Must be forgetDay, not recordDay with empty totals: an empty day is now
    // deliberately a no-op on usage_day (that is what stopped a quiet day from
    // wiping real history), and it still marks the day *observed*, which would
    // leave 1970 in the coverage count and overstate how much history exists.
    await forgetDay(day);
    await forgetDay(other);
    const cleaned = await readDay(day);
    const cov2 = await coverage();
    console.log(
      `${tag} cleaned up: ${Object.keys(cleaned).length === 0}, coverage back to days=${cov2.days} oldest=${cov2.oldest}`
    );
    console.log(`${tag} OK`);
  } catch (e) {
    console.log(`${tag} FAILED: ${describe(e)}`);
  }
}

/**
 * Drives AndroidUsageStatsSource end to end against the device and reports what
 * it actually produces, so a screen full of zeros can be traced to its cause:
 * permission, the query, the package filter, the series mapping, or the cache.
 */
export async function verifyAndroidSource(): Promise<void> {
  const tag = '[SRC]';
  try {
    // A private instance, never the installed singleton.
    //
    // This used to drive `androidSource` directly, which the running app is also
    // using: the probe's setTracked() replaced the user's selection mid-flight
    // while both were loading, so arrays got mapped against the wrong series list
    // and the live screens showed corrupted totals. The diagnostic was causing
    // the symptom it was meant to explain.
    const androidSource = new AndroidUsageStatsSource();
    const apps = await UsageStats.installedApps();
    // Pick something known to be heavy so zero is unambiguous evidence of a bug.
    const probe = ['com.instagram.android', 'com.alltrails.alltrails'].filter((p) =>
      apps.some((a) => a.packageName === p)
    );
    console.log(`${tag} probing packages: ${JSON.stringify(probe)}`);

    androidSource.setTracked(probe, apps);
    console.log(`${tag} series after setTracked: ${JSON.stringify(androidSource.series().map((x) => x.id))}`);

    await androidSource.load(14);
    console.log(`${tag} status after load: ${androidSource.status}`);

    for (let idx = 0; idx < 5; idx++) {
      console.log(`${tag} dayTotals(${idx}) = ${JSON.stringify(androidSource.dayTotals(idx))}`);
    }

    // Compare against the raw native call for the same window, to isolate whether
    // the loss is in the query or in everything after it.
    const now = Date.now();
    const raw = await UsageStats.queryTotals(now - 86_400_000, now);
    const rawForProbe = probe.map((p) => [p, Math.round((raw[p] ?? 0) / 60_000)]);
    console.log(`${tag} raw native last 24h (minutes): ${JSON.stringify(rawForProbe)}`);
    console.log(`${tag} raw native package count: ${Object.keys(raw).length}`);
  } catch (e) {
    console.log(`${tag} FAILED: ${describe(e)}`);
  }
}

/** What the rollup actually holds right now, per day. */
export async function logRollupContents(): Promise<void> {
  const tag = '[HIST]';
  try {
    const cov = await coverage();
    console.log(`${tag} coverage days=${cov.days} oldest=${cov.oldest} newest=${cov.newest}`);
    for (let idx = 0; idx < 4; idx++) {
      const day = dayStamp(dateAt(idx));
      const totals = await readDay(day);
      const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
      const top = entries.slice(0, 4).map(([p, m]) => `${p.split('.').pop()}=${Math.round(m)}m`);
      console.log(`${tag} ${day}: ${entries.length} apps ${JSON.stringify(top)}`);
    }
  } catch (e) {
    console.log(`${tag} FAILED: ${describe(e)}`);
  }
}

/** What the *installed* source - the one the screens read - actually reports. */
export function logLiveSource(): void {
  const tag = '[LIVE]';
  try {
    const src = usageSource();
    const series = src.series();
    const day0 = src.dayTotals(0);
    const pairs = series.map((ser, i) => [ser.id, day0[i] ?? 0] as const).filter(([, v]) => v > 0);
    pairs.sort((a, b) => b[1] - a[1]);
    console.log(`${tag} source=${src.id} status=${src.status}`);
    console.log(`${tag} series=${series.length} dayTotals(0).length=${day0.length}`);
    console.log(`${tag} today sum=${Math.round(day0.reduce((s, v) => s + v, 0))}m over ${pairs.length} apps`);
    console.log(`${tag} top: ${JSON.stringify(pairs.slice(0, 5).map(([p, v]) => [p, Math.round(v)]))}`);
    const ig = series.findIndex((x) => x.id === 'com.instagram.android');
    console.log(`${tag} instagram index=${ig} value=${ig >= 0 ? Math.round(day0[ig] ?? -1) : 'n/a'}`);
  } catch (e) {
    console.log(`${tag} FAILED: ${describe(e)}`);
  }
}
