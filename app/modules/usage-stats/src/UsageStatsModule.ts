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
  /** Mirrors the tracked selection to the home-screen widget and redraws it.
   *  The widget runs without JS, so this is the only way it learns the selection. */
  syncWidgets(tracked: string[]): void;
}

export default requireNativeModule<UsageStatsModule>('UsageStats');
