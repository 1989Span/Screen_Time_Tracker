// Chooses which usage source the app reads from, and is the only place that
// decision is made.
//
// There is no demo or generated data anywhere in the app: every number shown comes
// from the device. Before the real source can answer, an empty source stands in
// and every chart renders blank, which is what "no data yet" should look like.
// usageSource() still throws when nothing at all is installed, because that is a
// programming error rather than a state a user can reach.

import { Platform } from 'react-native';

import { UsageStats } from '../../modules/usage-stats';
import { useAppsStore, isConfigured } from '../state/appsStore';
import { androidSource } from './androidSource';
import { registerBackgroundSync } from './backgroundSync';
import { emptySource } from './emptySource';
import { setUsageSource } from './source';

/** Longest span any screen asks for (the year card). */
export const MAX_DAYS_NEEDED = 366;

/**
 * Hands the current selection to the home-screen widget and the hourly nudges,
 * which run without JS, and refreshes both.
 *
 * Runs after every load, including ones that load nothing because access is off
 * or nothing is tracked, so the widget can show the right prompt. A problem
 * there must never break the app's own load, so failures are only logged.
 */
function syncTracked(tracked: string[]): void {
  try {
    UsageStats.syncTracked(tracked);
  } catch (e) {
    console.log('[NATIVE] sync failed: ' + String(e));
  }
}

/**
 * Installs the empty source.
 *
 * Called synchronously at startup so the data layer always has *a* source before
 * the first render - it throws otherwise. On Android this is replaced by the real
 * source via installRealUsageSource(); elsewhere it stays, because no other
 * platform here can report usage and inventing some would be worse than blank.
 */
export function installDefaultUsageSource(): void {
  setUsageSource(emptySource);
}

export type SourceKind = 'empty' | 'android';

/**
 * Switches to real device data when the platform can provide it, and reports which
 * source ended up installed.
 *
 * The Android source is installed even when setup is incomplete - with status
 * 'denied' or an empty series list - so the UI shows the permission gate or the
 * picker rather than any stand-in numbers.
 */
export async function installRealUsageSource(): Promise<SourceKind> {
  if (Platform.OS !== 'android') return 'empty';

  const store = useAppsStore.getState();
  await store.refresh();

  const state = useAppsStore.getState();
  androidSource.setTracked(state.tracked, state.installed);
  setUsageSource(androidSource);

  // Only query when there is both permission and something selected to measure.
  if (isConfigured(state)) {
    await androidSource.load(MAX_DAYS_NEEDED);
    // Tell the view models the cache is warm; they cannot see it otherwise.
    useAppsStore.getState().markDataLoaded();
  }
  syncTracked(state.tracked);

  // Keep history accumulating while the app is closed. Registration needs
  // permission to be worth anything, but not a selection: recording covers every
  // countable package regardless of what is currently tracked.
  if (state.permission === 'granted') {
    void registerBackgroundSync();
  }
  return 'android';
}

/**
 * Re-reads device data after the user changes their selection or grants access.
 * Cheap enough to call from the picker's save action.
 */
export async function reloadUsage(): Promise<void> {
  const state = useAppsStore.getState();
  androidSource.setTracked(state.tracked, state.installed);
  if (isConfigured(state)) {
    await androidSource.load(MAX_DAYS_NEEDED);
    useAppsStore.getState().markDataLoaded();
  }
  // After the load, so the widget and nudges read the history this load just recorded.
  syncTracked(state.tracked);
}
