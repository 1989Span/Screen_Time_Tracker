import { NativeModule, requireNativeModule } from 'expo';

import { InstalledApp, PackageTotals, RetentionProbe, UsageEvent } from './UsageStats.types';

declare class UsageStatsModule extends NativeModule<Record<string, never>> {
  /** Whether usage access is granted. Cheap; safe to call on every resume. */
  hasPermission(): boolean;
  /** Opens Settings > Special app access > Usage access. No result callback -
   *  re-check hasPermission() when the app resumes. */
  openSettings(): void;
  installedApps(): Promise<InstalledApp[]>;
  /** Per-package foreground ms in [startMs, endMs). */
  queryTotals(startMs: number, endMs: number): Promise<PackageTotals>;
  /** Raw resume/pause events, for attributing usage to an hour. */
  queryEvents(startMs: number, endMs: number): Promise<UsageEvent[]>;
  /** What this device actually retains, measured rather than assumed. */
  probeRetention(): Promise<RetentionProbe>;
  /** Mirrors the tracked selection to the parts that run without JS, the
   *  home-screen widget and the hourly nudges, and refreshes both. */
  syncTracked(tracked: string[]): void;
  /** Whether hourly nudges are switched on in Settings. On by default. */
  nudgesEnabled(): boolean;
  /** Switches hourly nudges on or off. */
  setNudgesEnabled(on: boolean): void;
  /** Whether Android will show Gauge's notifications (Android 13+ permission
   *  granted, and not turned off in system settings). */
  notificationsAllowed(): boolean;
  /** Whether the app has already asked for notification permission once. */
  nudgesPrompted(): boolean;
  markNudgesPrompted(): void;
}

export default requireNativeModule<UsageStatsModule>('UsageStats');
