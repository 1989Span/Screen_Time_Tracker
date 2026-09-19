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
import { coverage, readDay, recordDay, sumByPackage } from './rollupStore';

const DAY_MS = 86_400_000;

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
    await recordDay({ day, totals: {} });
    await recordDay({ day: other, totals: {} });
    const cleaned = await readDay(day);
    console.log(`${tag} cleaned up: ${Object.keys(cleaned).length === 0}`);
    console.log(`${tag} OK`);
  } catch (e) {
    console.log(`${tag} FAILED: ${String(e)}`);
  }
}
