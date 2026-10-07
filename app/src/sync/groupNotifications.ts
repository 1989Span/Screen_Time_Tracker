// Push notifications about requests to stop tracking an app in a group.
//
// The server decides who hears what (supabase/migrations/0002_stop_tracking_requests.sql):
// everyone else when someone asks, the person who asked when each member votes,
// and the result once the last vote is in. This file only registers the phone
// to receive them and opens the request when one is tapped.
//
// Pushes travel through Expo's push service and Firebase Cloud Messaging, so
// they arrive with the app closed. Registration happens only while the app is
// open and you're in a group: never from the background task, and never for
// someone who doesn't use groups.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useGroupsStore } from '../state/groupsStore';
import { groupsApi } from './groupsApi';
import { groupsServerConfigured } from './supabase';

/** Android channel for these notifications. The server names it in every push. */
export const GROUP_CHANNEL = 'group-requests';

let token: string | null = null;
let askedThisLaunch = false;

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
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
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
