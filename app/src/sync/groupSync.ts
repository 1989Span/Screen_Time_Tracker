// When group sync runs while the app is open.
//
// After every usage load, which covers launch, returning to the app and
// changing your selection, so the numbers uploaded are always freshly loaded
// ones. The background task covers the rest (groupsBackground.ts).
//
// Kept apart from the store so the store doesn't depend on the usage bootstrap,
// which would make an import cycle through the background task.

import { useGroupsStore } from '../state/groupsStore';
import { onUsageLoaded, reloadUsage } from '../usage/bootstrap';

let started = false;

/** Call once at startup. */
export function startGroupSync(): void {
  if (started) return;
  started = true;
  onUsageLoaded(() => void useGroupsStore.getState().sync());
}

/** "Sync now": reload usage first so today's number is current. The load then triggers the sync. */
export async function syncNow(): Promise<void> {
  await reloadUsage();
}
