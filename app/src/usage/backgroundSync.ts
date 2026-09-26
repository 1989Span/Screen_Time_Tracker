// Keeps history accumulating while the app is closed.
//
// Why this is needed
// -----------------
// The OS keeps about 10 days of per-day usage and then forgets. Recording only on
// launch means a fortnight away from the app loses those days permanently - the
// OS has dropped them and the app never wrote them down. This task closes that
// window.
//
// What it is not
// --------------
// Not the primary mechanism, and it must not be relied on as one. Android runs
// deferrable work when it feels like it: `minimumInterval` is a floor, not a
// schedule. The saving grace is the ~10-day OS retention - a task that manages to
// run even once a week loses nothing, so "usually, roughly daily" is sufficient.
//
// Samsung in particular is aggressive about killing background work (see
// dontkillmyapp.com), so on this device the app should be exempted from battery
// optimisation for the task to run reliably. Launch-time recording remains the
// backstop either way.

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { syncGroupsFromHistory } from '../sync/groupsBackground';
import { recordOsDays } from './recorder';
import { prune } from './rollupStore';

/**
 * Named v2 because Android keeps a registered task at the interval it was
 * registered with. The rename makes existing installs pick up the new one.
 */
export const BACKGROUND_SYNC_TASK = 'gauge-usage-sync-v2';
/** The once-a-day task earlier builds registered. Removed on the next launch. */
const RETIRED_TASK = 'gauge-usage-sync';

/**
 * Every 3 hours, as a floor: Android runs deferrable work when it chooses.
 * Once a day would be plenty for the ~10 days of OS retention, but group
 * members see each other's numbers only as fresh as the last upload, and
 * yesterday's final total can't be scored until it arrives. Expressed in minutes.
 */
const INTERVAL_MINUTES = 3 * 60;

// Defined at module scope, as the API requires: the task must already be
// registered by name when the OS wakes the app headlessly.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const result = await recordOsDays();
    if (result.skipped === 'no-permission') {
      // Access was revoked while we were away. Nothing to do, and nothing broken.
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    // Housekeeping here rather than on launch, where it would compete with the
    // first paint.
    await prune();
    // Upload to any groups. Its failure (offline, say) shouldn't mark the
    // recording as failed: the next run or launch retries it.
    await syncGroupsFromHistory().catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Failing loudly gains nothing: the next launch records the same days, and
    // the OS still holds ~10 days of slack.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Defined so a run of the retired task, fired before it is unregistered, finds
// something to call rather than an unknown name. It does nothing.
TaskManager.defineTask(RETIRED_TASK, async () => BackgroundTask.BackgroundTaskResult.Success);

/** Register the periodic sync. Idempotent - safe to call on every launch. */
export async function registerBackgroundSync(): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;
    if (await TaskManager.isTaskRegisteredAsync(RETIRED_TASK)) {
      await BackgroundTask.unregisterTaskAsync(RETIRED_TASK);
    }
    const already = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    if (already) return true;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: INTERVAL_MINUTES });
    return true;
  } catch {
    return false;
  }
}

export async function unregisterBackgroundSync(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch {
    // Nothing useful to do if deregistration fails.
  }
}

export async function isBackgroundSyncRegistered(): Promise<boolean> {
  try {
    return await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
  } catch {
    return false;
  }
}
