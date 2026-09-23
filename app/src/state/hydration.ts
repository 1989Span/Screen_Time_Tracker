// Persisted stores rehydrate asynchronously, so the first frame after launch
// renders store defaults and only then swaps to what was saved. On a device
// that reads as a flash of the wrong state - all categories tracked before your
// selection appears, or "no limit" before your timer does. This gates the first
// render until every persisted store has read from disk.

import { useSyncExternalStore } from 'react';
import { useDetailStore } from './detailStore';
import { useGroupsStore } from './groupsStore';
import { usePenaltyStore } from './penaltyStore';
import { useTimersStore } from './timersStore';

const persisted = [useTimersStore, usePenaltyStore, useGroupsStore, useDetailStore];

// onFinishHydration fires whether the read succeeded or threw, so a storage
// failure degrades to "no saved state" rather than hanging on a blank screen.
const subscribe = (onChange: () => void) => {
  const unsubscribe = persisted.map((s) => s.persist.onFinishHydration(onChange));
  return () => unsubscribe.forEach((off) => off());
};

const allHydrated = () => persisted.every((s) => s.persist.hasHydrated());

/** True once all persisted stores have rehydrated (or failed to).
 *  useSyncExternalStore re-reads the snapshot after subscribing, so a store that
 *  finishes between render and subscribe cannot be missed. */
export function useStoresHydrated(): boolean {
  return useSyncExternalStore(subscribe, allHydrated, allHydrated);
}
