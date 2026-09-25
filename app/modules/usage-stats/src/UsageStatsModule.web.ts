import { registerWebModule, NativeModule } from 'expo';

import { InstalledApp, PackageTotals, RetentionProbe, UsageEvent } from './UsageStats.types';

const EMPTY_RETENTION = {
  buckets: 0,
  distinctPeriods: 0,
  packages: 0,
  oldestMs: 0,
  newestMs: 0,
  spanDays: 0,
};

/**
 * There is no equivalent of UsageStatsManager on the web, so this reports
 * "no permission, no data" rather than throwing. The app treats that as
 * status 'unavailable' and keeps the demo source installed, which is what makes
 * the browser still usable for building UI.
 */
class UsageStatsModule extends NativeModule<Record<string, never>> {
  hasPermission(): boolean {
    return false;
  }
  openSettings(): void {
    // Nothing to open.
  }
  async installedApps(): Promise<InstalledApp[]> {
    return [];
  }
  async queryTotals(): Promise<PackageTotals> {
    return {};
  }
  async queryEvents(): Promise<UsageEvent[]> {
    return [];
  }
  syncWidgets(): void {
    // No home-screen widgets on the web.
  }
  async probeRetention(): Promise<RetentionProbe> {
    return {
      daily: { ...EMPTY_RETENTION },
      weekly: { ...EMPTY_RETENTION },
      monthly: { ...EMPTY_RETENTION },
      yearly: { ...EMPTY_RETENTION },
      events: { ...EMPTY_RETENTION },
    };
  }
}

export default registerWebModule(UsageStatsModule, 'UsageStatsModule');
