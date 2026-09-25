// Hourly screen-time nudges: the Settings switch and the one-time permission ask.
//
// The nudges themselves are native (modules/usage-stats, nudge/HourlyNudge.kt)
// because they have to fire while the app is closed. This file decides when to
// ask Android for notification permission, and keeps the switch honest about
// whether nudges can actually arrive.

import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native';

import { UsageStats } from '../../modules/usage-stats';

type Ask = 'granted' | 'denied' | 'blocked';

/** Android 13 (API 33) added the runtime permission to post notifications. */
const needsRuntimePermission = () => Platform.OS === 'android' && Number(Platform.Version) >= 33;

/**
 * Asks Android for permission to post notifications.
 * 'blocked' means Android won't show the prompt again (the user declined twice),
 * so only system settings can turn notifications back on.
 */
async function requestPermission(): Promise<Ask> {
  if (needsRuntimePermission()) {
    // On Android 13+ this permission is the app's notification switch, so a
    // grant means notifications will show.
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (r === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  }
  // Below Android 13 there is nothing to ask, but notifications can still be off.
  return UsageStats.notificationsAllowed() ? 'granted' : 'blocked';
}

/**
 * The one time the app asks without being prompted: when a user first reaches
 * the main app. Nudges are on by default, and on Android 13+ they can't arrive
 * without permission. Declining switches them off, so the Settings switch never
 * claims to be on when nothing can arrive.
 */
export async function askForNudgesOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (UsageStats.nudgesPrompted() || !UsageStats.nudgesEnabled()) return;
  // Marked before the prompt is shown, so a re-render can't ask twice.
  UsageStats.markNudgesPrompted();
  if (UsageStats.notificationsAllowed()) return;
  if ((await requestPermission()) !== 'granted') UsageStats.setNudgesEnabled(false);
}

/** Runs [askForNudgesOnce] once the app is past setup and its state has loaded. */
export function useNudgePrompt(ready: boolean): void {
  useEffect(() => {
    if (ready) void askForNudgesOnce().catch(() => {});
  }, [ready]);
}

export interface NudgeSetting {
  /** Switched on, and Android will show them. */
  on: boolean;
  /** Switched on in Gauge, but notifications are off for Gauge in Android. */
  blocked: boolean;
  toggle: () => void;
  openSystemSettings: () => void;
}

function read(): { on: boolean; blocked: boolean } {
  const enabled = UsageStats.nudgesEnabled();
  const allowed = UsageStats.notificationsAllowed();
  return { on: enabled && allowed, blocked: enabled && !allowed };
}

/** The Settings switch. Null off Android, where there are no nudges. */
export function useNudgeSetting(): NudgeSetting | null {
  const [state, setState] = useState(() => (Platform.OS === 'android' ? read() : { on: false, blocked: false }));

  // Notifications can be switched off in Android settings while the app is in
  // the background, so re-read whenever it comes back.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setState(read());
    });
    return () => sub.remove();
  }, []);

  const toggle = useCallback(() => {
    void (async () => {
      if (state.on) {
        UsageStats.setNudgesEnabled(false);
      } else {
        const ask = UsageStats.notificationsAllowed() ? 'granted' : await requestPermission();
        if (ask === 'granted') UsageStats.setNudgesEnabled(true);
        else if (ask === 'blocked') void Linking.openSettings();
      }
      setState(read());
    })().catch(() => {});
  }, [state.on]);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  if (Platform.OS !== 'android') return null;
  return { ...state, toggle, openSystemSettings };
}
