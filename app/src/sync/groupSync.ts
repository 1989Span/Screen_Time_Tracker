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
import { usageSource } from '../usage/source';
import { postChallengeNotices } from './challengeNotices';
import { registerForGroupPushes } from './groupNotifications';

let started = false;

/** Call once at startup. */
export function startGroupSync(): void {
  if (started) return;
  started = true;
  onUsageLoaded(
    () =>
      void useGroupsStore
        .getState()
        .sync()
        .then(() => {
          registerIfInGroups();
          return postChallengeNotices((stamp) =>
            usageSource().status === 'ready' ? usageSource().allAppsDay(stamp) : {}
          );
        })
        .catch(() => {})
  );
  // Joining or creating your first group registers straight away, so the first
  // request reaches you without waiting for the next usage load.
  useGroupsStore.subscribe((s, prev) => {
    if (s.groups.length > 0 && prev.groups.length === 0) registerIfInGroups();
  });
}

/** Group notifications are only for people in a group. (Leaving your last one unregisters: see groupsStore.) */
function registerIfInGroups(): void {
  if (useGroupsStore.getState().groups.length > 0) void registerForGroupPushes().catch(() => {});
}

/** "Sync now": reload usage first so today's number is current. The load then triggers the sync. */
export async function syncNow(): Promise<void> {
  await reloadUsage();
}
