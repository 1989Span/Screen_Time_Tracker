// Whether the app can show real data yet, and what to show instead if not.
//
// Returns null once setup is complete, otherwise which setup screen is due.
//
// Two things make this a gate rather than a normal route. First, usage access is
// a special permission with no runtime prompt and no grant callback, so the only
// way to notice it was granted is to re-check when the app comes back to the
// foreground - hence the AppState listener. Second, nothing is tracked by
// default, so an app past the permission step but with no selection has nothing
// to measure and every chart would read zero.
//
// It deliberately does not fall back to the demo generator. Presenting generated
// numbers to someone who believes they are looking at their own screen time is
// the failure most worth designing against.

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

import { reloadUsage } from '../usage/bootstrap';
import { useAppsStore } from './appsStore';

export type SetupStep = 'permission' | 'apps' | null;

export function useSetupGate(): SetupStep {
  const permission = useAppsStore((s) => s.permission);
  const tracked = useAppsStore((s) => s.tracked);
  const refresh = useAppsStore((s) => s.refresh);
  const recheckPermission = useAppsStore((s) => s.recheckPermission);
  // A ref, not state: this only guards a one-shot call and must not trigger a
  // render (which is also what react-hooks/set-state-in-effect is warning about).
  const primed = useRef(false);

  // First read of permission and the installed list. On web there is no
  // UsageStatsManager at all, so setup is skipped and the demo source stands.
  useEffect(() => {
    if (Platform.OS !== 'android' || primed.current) return;
    primed.current = true;
    void refresh();
  }, [refresh]);

  // The user leaves to Settings, flips the toggle, and returns. That return is
  // the only signal we get, so re-check on it - and reload usage if access
  // appeared, so data is ready by the time the gate lifts.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onChange = (next: AppStateStatus) => {
      if (next !== 'active') return;
      const now = recheckPermission();
      if (now === 'granted' && useAppsStore.getState().tracked.length > 0) {
        void reloadUsage();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [recheckPermission]);

  // Load usage whenever there is a selection to load for.
  //
  // This is not merely an optimisation. installRealUsageSource() runs at module
  // load and only calls load() when setup already looks complete - but zustand
  // rehydrates asynchronously, so at that moment `tracked` is still empty and the
  // load is skipped. The selection then arrives from storage with nothing having
  // fetched data for it, and every chart reads zero. Keying on the selection also
  // means editing it in the picker refetches.
  const selectionKey = tracked.join(',');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (permission !== 'granted' || selectionKey === '') return;
    void reloadUsage();
  }, [permission, selectionKey]);

  if (Platform.OS !== 'android') return null;
  // 'unknown' means the first check has not returned. Showing the permission
  // screen then would flash a request at someone who has already granted it, so
  // hold on the current screen until we actually know.
  if (permission === 'denied') return 'permission';
  if (permission === 'granted' && tracked.length === 0) return 'apps';
  return null;
}
