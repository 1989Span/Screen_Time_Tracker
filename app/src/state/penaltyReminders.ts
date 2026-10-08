// Reminders to keep or change the penalty limit in the first days of a month.
//
// While a limit is running, the next month carries it over, and the user has
// the first 4 days to keep, change or switch it off (penaltyPlan.ts). Each of
// those days at 10am a notification asks, until they confirm.
//
// They're scheduled ahead with expo-notifications, so they arrive with the app
// closed. Android fires them within a few minutes of 10am: Gauge doesn't hold
// the exact-alarm permission, and doesn't need it for a reminder. Every change
// to the plans reschedules from scratch, so confirming cancels the rest.

import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { dayStamp } from '../clock';
import { fmtMoney, limLabel } from '../data';
import { PENALTY_LIMIT_ENABLED } from '../features';
import { CHANGE_WINDOW_DAYS, Plans, editState, longDay, monthName, monthOf, nextMonth, planFor } from '../penaltyPlan';
import { usePenaltyStore } from './penaltyStore';

export const PENALTY_CHANNEL = 'penalty-limit';
const ID_PREFIX = 'penalty-window-';
const REMIND_HOUR = 10;

export interface Reminder {
  id: string;
  at: Date;
  title: string;
  body: string;
}

const atTen = (stamp: string) => {
  const [y, m, d] = stamp.split('-').map(Number);
  return new Date(y, m - 1, d, REMIND_HOUR, 0, 0, 0);
};

/**
 * The reminders due from `now` on: what's left of this month's window if it's
 * open, and next month's window if this month carries over. Pure, so tested.
 */
export function remindersFor(plans: Plans, now: Date): Reminder[] {
  const today = dayStamp(now);
  const month = monthOf(today);
  const out: Reminder[] = [];

  const add = (target: string, setting: { limit: number; rate: number }) => {
    const name = monthName(target);
    const last = target + '-' + String(CHANGE_WINDOW_DAYS).padStart(2, '0');
    for (let d = 1; d <= CHANGE_WINDOW_DAYS; d++) {
      const stamp = target + '-' + String(d).padStart(2, '0');
      const at = atTen(stamp);
      if (at <= now) continue;
      out.push({
        id: ID_PREFIX + stamp,
        at,
        title: 'Confirm ' + name + '’s penalty limit',
        body:
          limLabel(setting.limit) +
          ' a day and ' +
          fmtMoney(setting.rate) +
          '/min carried over. Keep or change it by ' +
          longDay(last) +
          '.',
      });
    }
  };

  const state = editState(plans, today);
  const current = planFor(plans, month);
  if (state.kind === 'window' && current?.setting) add(month, current.setting);
  // Whatever this month ends with carries into next month.
  if (current?.setting) add(nextMonth(month), current.setting);
  return out;
}

/** Replaces every scheduled penalty reminder with the ones due now. */
export async function scheduleReminders(plans: Plans): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
  const due = remindersFor(plans, new Date());
  if (due.length === 0) return;
  await Notifications.setNotificationChannelAsync(PENALTY_CHANNEL, {
    name: 'Penalty limit',
    description: 'A reminder in the first days of each month to keep or change your limit.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  for (const r of due) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { kind: 'penalty-window' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: PENALTY_CHANNEL },
    });
  }
}

/** Keeps the reminders in step with the plans, once saved state has loaded. */
export function usePenaltyReminders(ready: boolean): void {
  const plans = usePenaltyStore((s) => s.plans);
  useEffect(() => {
    if (!ready || !PENALTY_LIMIT_ENABLED || Platform.OS !== 'android') return;
    void scheduleReminders(plans).catch(() => {});
  }, [ready, plans]);
}
