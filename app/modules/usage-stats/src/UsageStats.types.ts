/** One installed app, as the picker sees it. */
export interface InstalledApp {
  packageName: string;
  label: string;
  /** Android's ApplicationInfo.category, or -1 for CATEGORY_UNDEFINED.
   *  Reported only so group views can aggregate; tracking is per package. */
  category: number;
  isSystem: boolean;
  /** Whether the app appears in the launcher. Anything without an icon is
   *  usually a service the user would not recognise. */
  hasLauncherIcon: boolean;
}

/** Package name -> foreground milliseconds. */
export type PackageTotals = Record<string, number>;

/** One app-switch event. Only resume/pause are reported. */
export interface UsageEvent {
  packageName: string;
  timeStamp: number;
  resumed: boolean;
}

/** What one interval actually holds on this device. */
export interface RetentionInfo {
  buckets: number;
  distinctPeriods: number;
  packages: number;
  oldestMs: number;
  newestMs: number;
  spanDays: number;
}

export type RetentionProbe = Record<'daily' | 'weekly' | 'monthly' | 'yearly' | 'events', RetentionInfo>;

/** Android's ApplicationInfo.category constants, for group aggregation only. */
export const ANDROID_CATEGORY = {
  UNDEFINED: -1,
  GAME: 0,
  AUDIO: 1,
  VIDEO: 2,
  IMAGE: 3,
  SOCIAL: 4,
  NEWS: 5,
  MAPS: 6,
  PRODUCTIVITY: 7,
  ACCESSIBILITY: 8,
} as const;
