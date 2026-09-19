// Chooses which usage source the app reads from, and is the only place that
// decision is made.
//
// usageSource() throws when nothing is installed rather than quietly falling back
// to the demo generator. That is deliberate: a release build silently showing
// generated numbers as if they were the user's real screen time would be a far
// worse failure than a loud one at startup.

import { Platform } from 'react-native';

import { useAppsStore, isConfigured } from '../state/appsStore';
import { androidSource } from './androidSource';
import { demoSource } from './demoSource';
import { setUsageSource } from './source';

/** Longest span any screen asks for (the year card). */
export const MAX_DAYS_NEEDED = 366;

/**
 * Installs the demo generator.
 *
 * Called synchronously at startup so the data layer always has *a* source before
 * the first render - it throws otherwise. On Android this is immediately replaced
 * by the real source via installRealUsageSource(); on web it is the only option,
 * since there is no equivalent of UsageStatsManager in a browser.
 */
export function installDefaultUsageSource(): void {
  setUsageSource(demoSource);
  // Demo loading is synchronous arithmetic, so this resolves immediately; the
  // call exists so the startup path is already shaped for a source that awaits.
  void demoSource.load(MAX_DAYS_NEEDED);
}

export type SourceKind = 'demo' | 'android';

/**
 * Switches to real device data when the platform can provide it and the user has
 * finished setup, and reports which source ended up installed.
 *
 * Deliberately does NOT fall back to demo data on Android when setup is
 * incomplete. The Android source is installed with its status set to 'denied' or
 * its series empty, so the UI shows the permission gate or the picker. Showing
 * generated numbers to someone who thinks they are looking at their own screen
 * time is the one outcome worth engineering against.
 */
export async function installRealUsageSource(): Promise<SourceKind> {
  if (Platform.OS !== 'android') return 'demo';

  const store = useAppsStore.getState();
  await store.refresh();

  const state = useAppsStore.getState();
  androidSource.setTracked(state.tracked, state.installed);
  setUsageSource(androidSource);

  // Only query when there is both permission and something selected to measure.
  if (isConfigured(state)) {
    await androidSource.load(MAX_DAYS_NEEDED);
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
  }
}
