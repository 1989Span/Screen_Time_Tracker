// Pushes from the group server.
//
// Two kinds:
//  * Requests to stop tracking an app. The server decides who hears what
//    (supabase/migrations/0002_stop_tracking_requests.sql): everyone else when
//    someone asks, the person who asked when each member votes, and the result
//    once the last vote is in. Tapping one opens the request.
//  * A silent ping at the top of every hour (0003_hourly_sync.sql). It shows
//    nothing; it runs a sync, even with the app closed, so everyone's numbers
//    are at most an hour old.
//
// Pushes travel through Expo's push service and Firebase Cloud Messaging, so
// they arrive with the app closed. Registration happens only while the app is
// open and you're in a group: never from the background task, and never for
// someone who doesn't use groups.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useGroupsStore } from '../state/groupsStore';
import { reloadUsage } from '../usage/bootstrap';
import { recordOsDays } from '../usage/recorder';
import { syncGroupsFromHistory } from './groupsBackground';
import { groupsApi } from './groupsApi';
import { groupsServerConfigured } from './supabase';

/** Android channel for these notifications. The server names it in every push. */
export const GROUP_CHANNEL = 'group-requests';

/** Runs the hourly sync when the server's ping arrives. */
export const GROUP_SYNC_TASK = 'gauge-group-sync-ping';

let token: string | null = null;
let askedThisLaunch = false;

const parse = (text: unknown): unknown => {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};
const kindOf = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { kind?: unknown }).kind : null);

/**
 * True for the hourly ping, however it arrived: as a notification's data while
 * the app is open, or as the raw Firebase message a background task receives,
 * where Expo's push service carries the data as JSON text.
 */
export function isSyncPing(payload: unknown): boolean {
  if (kindOf(payload) === 'sync') return true;
  const fcm = typeof payload === 'object' && payload !== null ? (payload as { data?: unknown }).data : null;
  if (kindOf(fcm) === 'sync') return true;
  const f = (fcm ?? {}) as { dataString?: unknown; body?: unknown };
  return kindOf(parse(f.dataString)) === 'sync' || kindOf(parse(f.body)) === 'sync';
}

/**
 * The hourly sync. With the app open, reload usage, which syncs when it lands
 * (sync/groupSync.ts). Closed, there is no loaded usage, so record today and
 * yesterday from Android into the history database and upload from there, as
 * the background task does. Yesterday matters just after midnight: its final
 * total decides that day's point.
 */
export async function syncOnPing(): Promise<void> {
  if (AppState.currentState === 'active') {
    await reloadUsage();
    return;
  }
  await recordOsDays(2);
  await syncGroupsFromHistory();
}

// Defined at module scope, as the task manager requires: the task must already
// be defined by name when Android starts the app headlessly for a push.
TaskManager.defineTask<Notifications.NotificationTaskPayload>(GROUP_SYNC_TASK, async ({ data, error }) => {
  if (error || !isSyncPing(data)) return Notifications.BackgroundNotificationTaskResult.NoData;
  try {
    await syncOnPing();
    return Notifications.BackgroundNotificationTaskResult.NewData;
  } catch {
    // Offline, say. The next ping, launch or background run tries again.
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

/**
 * Registers this phone for group notifications, asking for notification
 * permission first if Android still lets the app ask. Safe to call after every
 * sync: the token is fetched from Expo once per launch, and saving it is an upsert.
 */
export async function registerForGroupPushes(): Promise<void> {
  if (Platform.OS !== 'android' || AppState.currentState !== 'active' || !groupsServerConfigured()) return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return;

  // Before the token: on Android 13+ the channel must exist for the permission
  // prompt to appear at all.
  await Notifications.setNotificationChannelAsync(GROUP_CHANNEL, {
    name: 'Group requests',
    description: 'When someone in your group asks to stop tracking an app, and how everyone votes.',
    importance: Notifications.AndroidImportance.HIGH,
  });

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain && !askedThisLaunch) {
    askedThisLaunch = true;
    await Notifications.requestPermissionsAsync();
  }

  // Registered even without permission: turning notifications on later in
  // Android settings then just works, with nothing to re-register.
  token ??= (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await groupsApi.setPushToken(token);

  // So the hourly ping can run a sync with the app closed.
  if (!(await TaskManager.isTaskRegisteredAsync(GROUP_SYNC_TASK))) {
    await Notifications.registerTaskAsync(GROUP_SYNC_TASK);
  }
}

const isRequest = (data: unknown): data is { kind: 'stop-request'; groupId: string } =>
  typeof data === 'object' &&
  data !== null &&
  (data as { kind?: unknown }).kind === 'stop-request' &&
  typeof (data as { groupId?: unknown }).groupId === 'string';

/** Opens the group's requests from a tapped notification. */
export function openFromNotification(data: unknown): boolean {
  if (!isRequest(data)) return false;
  useGroupsStore.getState().openRequests(data.groupId);
  return true;
}

/**
 * Shows group notifications while the app is open too, refreshes the group when
 * one arrives, and opens the request when one is tapped, including the tap
 * that launched the app.
 *
 * Waits for `ready` (saved state rehydrated), like incoming links, so restored
 * state can't overwrite where the tap navigated to.
 */
export function useGroupNotifications(ready: boolean): void {
  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;

    Notifications.setNotificationHandler({
      // The hourly ping has nothing to show. The sync it asks for runs in the
      // task above, which Expo runs with the app open too.
      handleNotification: async (n) => {
        const show = !isSyncPing(n.request.content.data);
        return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
      },
    });

    const open = (response: Notifications.NotificationResponse) => {
      if (openFromNotification(response.notification.request.content.data)) {
        Notifications.clearLastNotificationResponse();
      }
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last);

    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener((n) => {
      if (isRequest(n.request.content.data)) void useGroupsStore.getState().sync();
    });
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [ready]);
}
