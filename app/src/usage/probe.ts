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
