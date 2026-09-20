// Which apps exist on this device, which ones the user tracks, and whether we
// are allowed to read usage at all.
//
// Persisted: the tracked selection and the show-system preference. Deliberately
// not persisted: the installed-app list. Apps get installed and uninstalled, so a
// stale list would offer apps that are gone and hide ones that are new; re-reading
// it costs about 400ms for 591 packages, which is cheap enough to do on launch.
//
// Permission is not persisted either. It can be revoked in Settings while the app
// is backgrounded, so the only trustworthy answer is a fresh check.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { InstalledApp, UsageStats } from '../../modules/usage-stats';
import { isCountable, offerableApps } from '../usage/appFilter';
import { coverage } from '../usage/rollupStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

export type PermissionState = 'unknown' | 'granted' | 'denied';

interface AppsState {
  installed: InstalledApp[];
  tracked: string[];
  showSystem: boolean;
  permission: PermissionState;
  /** Distinct days of real history recorded, which gates Month and Year. */
  historyDays: number;
  loading: boolean;
  /** Set when the last refresh failed, so the UI can say so. */
  error: string | null;
  /** Picker search text. Transient, like the group-invite drafts - a stale
   *  search box on next launch would be confusing, not helpful. */
  query: string;
  /**
   * Bumped whenever the usage source finishes loading.
   *
   * The source is filled asynchronously but read synchronously from useMemo, so
   * without this nothing tells React the numbers arrived: the memo keeps the
   * empty values it computed before the load resolved. Every view model that
   * reads usage depends on this.
   */
  dataVersion: number;

  /** Re-read permission, the installed list and history coverage. */
  refresh: () => Promise<void>;
  /** Re-check permission only. Cheap; call when the app returns to foreground. */
  recheckPermission: () => PermissionState;
  openSettings: () => void;
  toggle: (packageName: string) => void;
  setTracked: (packages: string[]) => void;
  setShowSystem: (value: boolean) => void;
  setQuery: (value: string) => void;
  /** Announce that freshly loaded usage is available to read. */
  markDataLoaded: () => void;
  /** Track every app the picker currently offers, or clear the selection. */
  selectAll: () => void;
  clearAll: () => void;
}

export const useAppsStore = create<AppsState>()(
  persist(
    (set, get) => ({
      installed: [],
      tracked: [],
      showSystem: false,
      permission: 'unknown',
      historyDays: 0,
      loading: false,
      error: null,
      query: '',
      dataVersion: 0,

      refresh: async () => {
        set({ loading: true, error: null });
        try {
          const granted = UsageStats.hasPermission();
          // The installed list does not need usage access, so it is worth
          // loading even when permission is denied: the picker can be filled in
          // before the user grants anything.
          const installed = await UsageStats.installedApps();
          const history = await coverage();
          set({
            permission: granted ? 'granted' : 'denied',
            installed,
            historyDays: history.days,
            loading: false,
          });
        } catch (e) {
          set({ loading: false, error: String(e), permission: 'unknown' });
        }
      },

      recheckPermission: () => {
        try {
          const next: PermissionState = UsageStats.hasPermission() ? 'granted' : 'denied';
          if (next !== get().permission) set({ permission: next });
          return next;
        } catch {
          return get().permission;
        }
      },

      openSettings: () => UsageStats.openSettings(),

      toggle: (packageName) =>
        set((s) => ({
          tracked: s.tracked.includes(packageName)
            ? s.tracked.filter((p) => p !== packageName)
            : s.tracked.concat([packageName]),
        })),

      setTracked: (packages) => set({ tracked: packages.filter(isCountable) }),

      setShowSystem: (value) => set({ showSystem: value }),

      setQuery: (value) => set({ query: value }),

      markDataLoaded: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

      // Bulk actions operate on what the *filter* offers, not the raw installed
      // list, so "select all" cannot secretly enable the screensaver, a launcher
      // or (when system apps are hidden) dozens of packages the user never saw.
      selectAll: () =>
        set((s) => ({
          tracked: offerableApps(s.installed, { showSystem: s.showSystem }).map((a) => a.packageName),
        })),

      clearAll: () => set({ tracked: [] }),
    }),
    {
      name: storageKey('apps'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ tracked: s.tracked, showSystem: s.showSystem }),
      merge: (persisted, current) => {
        const p = persisted as { tracked?: unknown; showSystem?: unknown } | undefined;
        const tracked = Array.isArray(p?.tracked)
          ? p!.tracked.filter((v): v is string => typeof v === 'string' && isCountable(v))
          : current.tracked;
        return {
          ...current,
          tracked,
          showSystem: typeof p?.showSystem === 'boolean' ? p.showSystem : current.showSystem,
        };
      },
    }
  )
);

/** The apps to show in the picker, filtered and sorted. */
export const pickableApps = (s: Pick<AppsState, 'installed' | 'showSystem'>) =>
  offerableApps(s.installed, { showSystem: s.showSystem });

/** Whether the user has finished the one-time setup: allowed, and picked something. */
export const isConfigured = (s: Pick<AppsState, 'permission' | 'tracked'>) =>
  s.permission === 'granted' && s.tracked.length > 0;
