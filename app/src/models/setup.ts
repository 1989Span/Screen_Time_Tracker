// View models for the one-time setup: granting usage access, then choosing which
// apps to track.
//
// Both screens exist because of hard constraints, not product preference:
//
//  * PACKAGE_USAGE_STATS is a special permission. There is no runtime prompt and
//    no grant callback - the user has to toggle it in Settings. Confirmed on the
//    test device that adb cannot grant it either, so this screen is the only
//    route in for anyone.
//  * Nothing is tracked by default, so without a picker the app has nothing to
//    measure. 109 launchable apps on the test device means search is required,
//    not optional.

import { useMemo } from 'react';

import { useAppsStore, pickableApps } from '../state/appsStore';
import { reloadUsage } from '../usage/bootstrap';
import { colorForId } from '../usage/series';

export interface PermissionViewModel {
  granted: boolean;
  /** True while we have not yet asked the OS. */
  unknown: boolean;
  title: string;
  body: string;
  steps: string[];
  buttonLabel: string;
  openSettings: () => void;
  recheck: () => void;
  error: string | null;
}

export function usePermissionModel(): PermissionViewModel {
  const permission = useAppsStore((s) => s.permission);
  const error = useAppsStore((s) => s.error);
  const openSettings = useAppsStore((s) => s.openSettings);
  const recheckPermission = useAppsStore((s) => s.recheckPermission);

  return useMemo(
    () => ({
      granted: permission === 'granted',
      unknown: permission === 'unknown',
      title: 'Gauge needs usage access',
      body: 'Android keeps screen time behind a separate permission that only you can switch on. Nothing leaves your phone — Gauge reads it locally and stores it locally.',
      steps: ['Open Usage access settings', 'Find Gauge in the list', 'Switch it on, then come back'],
      buttonLabel: 'Open usage access settings',
      openSettings,
      recheck: () => {
        recheckPermission();
      },
      error,
    }),
    [permission, error, openSettings, recheckPermission]
  );
}

export interface AppRow {
  packageName: string;
  label: string;
  color: string;
  tracked: boolean;
  isSystem: boolean;
  onPress: () => void;
}

export interface AppPickerViewModel {
  rows: AppRow[];
  query: string;
  setQuery: (value: string) => void;
  showSystem: boolean;
  toggleShowSystem: () => void;
  /** e.g. "3 of 87 apps" — the denominator is what the filter currently offers. */
  countLabel: string;
  selectedCount: number;
  /** Empty-state copy that distinguishes "no apps" from "no search results". */
  emptyNote: string | null;
  /** "Select all apps" / "Clear all" — acts on what the filter offers. */
  bulkLabel: string;
  bulkAction: () => void;
  canContinue: boolean;
  /** Persist the choice and re-read usage for the new selection. */
  commit: () => Promise<void>;
  loading: boolean;
}

export function useAppPickerModel(): AppPickerViewModel {
  const installed = useAppsStore((s) => s.installed);
  const showSystem = useAppsStore((s) => s.showSystem);
  const tracked = useAppsStore((s) => s.tracked);
  const query = useAppsStore((s) => s.query);
  const loading = useAppsStore((s) => s.loading);
  const toggle = useAppsStore((s) => s.toggle);
  const setQuery = useAppsStore((s) => s.setQuery);
  const setShowSystem = useAppsStore((s) => s.setShowSystem);
  const selectAll = useAppsStore((s) => s.selectAll);
  const clearAll = useAppsStore((s) => s.clearAll);

  return useMemo(() => {
    const offerable = pickableApps({ installed, showSystem });
    const needle = query.trim().toLowerCase();
    const matching = needle
      ? offerable.filter((a) => a.label.toLowerCase().includes(needle) || a.packageName.toLowerCase().includes(needle))
      : offerable;

    const trackedSet = new Set(tracked);
    const rows: AppRow[] = matching.map((a) => ({
      packageName: a.packageName,
      label: a.label,
      // Same colour the charts will use, so the picker previews the breakdown.
      color: colorForId(a.packageName),
      tracked: trackedSet.has(a.packageName),
      isSystem: a.isSystem,
      onPress: () => toggle(a.packageName),
    }));

    const emptyNote =
      offerable.length === 0
        ? showSystem
          ? 'No apps found on this device.'
          : 'No apps found. Try showing system apps.'
        : matching.length === 0
          ? `Nothing matches “${query.trim()}”.`
          : null;

    return {
      rows,
      query,
      setQuery,
      showSystem,
      toggleShowSystem: () => setShowSystem(!showSystem),
      countLabel: `${tracked.length} of ${offerable.length} ${offerable.length === 1 ? 'app' : 'apps'} tracked`,
      // Flips to Clear once everything offered is already tracked.
      bulkLabel: offerable.length > 0 && tracked.length >= offerable.length ? 'Clear all' : 'Select all apps',
      bulkAction: offerable.length > 0 && tracked.length >= offerable.length ? clearAll : selectAll,
      selectedCount: tracked.length,
      emptyNote,
      // Tracking nothing would leave every chart empty, so require one.
      canContinue: tracked.length > 0,
      commit: reloadUsage,
      loading,
    };
  }, [installed, showSystem, tracked, query, loading, toggle, setQuery, setShowSystem, selectAll, clearAll]);
}
