// The penalty limit, month by month. Paper money: nothing is ever paid.
//
// The rules:
//
//  * A limit and fee are set for a calendar month and locked until it ends. Set
//    partway through a month, they start that day, and that day is charged.
//  * Each month carries over to the next with the same limit and fee. For the
//    first CHANGE_WINDOW_DAYS days of the new month they can be kept, changed or
//    switched off, and whatever is confirmed applies to the whole month,
//    including the window days already gone. After the window, the carried-over
//    settings lock without confirmation.
//  * A month switched off stays off, and nothing carries over from it.
//
// Plain data and arithmetic, so all of it is unit tested.

import { dateAt, dayStamp } from './clock';
import { PenaltySetting, chargeFor, dayLabel, dayUsageAt, minutesOver } from './data';

export const CHANGE_WINDOW_DAYS = 4;

export interface MonthPlan {
  /** The month's limit and fee, or null if the month was switched off. */
  setting: PenaltySetting | null;
  /** First day charged (YYYY-MM-DD): the 1st, or the day it was switched on. */
  from: string;
  /** Confirmed, so locked for the rest of the month. */
  confirmed: boolean;
}

/** Plans the user confirmed, by month (YYYY-MM). Carried-over months aren't stored. */
export type Plans = Record<string, MonthPlan>;

export const monthOf = (stamp: string) => stamp.slice(0, 7);
export const firstOfMonth = (month: string) => month + '-01';

export function lastOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return month + '-' + String(last).padStart(2, '0');
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? y + 1 + '-01' : y + '-' + String(m + 1).padStart(2, '0');
}

const MONTH_NAME = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** "October" */
export const monthName = (month: string) => MONTH_NAME[Number(month.slice(5, 7)) - 1];
/** "October 31" */
export const longDay = (stamp: string) => monthName(monthOf(stamp)) + ' ' + Number(stamp.slice(8, 10));

/**
 * The plan in force for a month: its own if confirmed, otherwise the latest
 * earlier month's settings carried over (unconfirmed, from the 1st). Null if
 * nothing was ever set, or the latest earlier month was switched off.
 */
export function planFor(plans: Plans, month: string): MonthPlan | null {
  if (plans[month]) return plans[month];
  const earlier = Object.keys(plans)
    .filter((m) => m < month)
    .sort()
    .pop();
  const prev = earlier ? plans[earlier] : null;
  if (!prev?.setting) return null;
  return { setting: prev.setting, from: firstOfMonth(month), confirmed: false };
}

/** The limit and fee charged on a day, if any. */
export function settingOn(plans: Plans, stamp: string): PenaltySetting | null {
  const p = planFor(plans, monthOf(stamp));
  return p?.setting && stamp >= p.from ? p.setting : null;
}

export type EditState =
  /** Nothing runs this month: a limit can be set, starting today. */
  | { kind: 'open' }
  /** Carried over and unconfirmed: keep, change or switch off for the whole month, until `until`. */
  | { kind: 'window'; until: string }
  /** Running and locked until `until`, the last day of the month. */
  | { kind: 'locked'; until: string };

export function editState(plans: Plans, today: string): EditState {
  const month = monthOf(today);
  const p = planFor(plans, month);
  if (!p?.setting) return { kind: 'open' };
  if (!p.confirmed && Number(today.slice(8, 10)) <= CHANGE_WINDOW_DAYS) {
    return { kind: 'window', until: month + '-' + String(CHANGE_WINDOW_DAYS).padStart(2, '0') };
  }
  return { kind: 'locked', until: lastOfMonth(month) };
}

/**
 * Applies a confirmed choice for this month. In the window it covers the whole
 * month; otherwise (switching on) it starts today. Returns null when the month
 * is locked, so nothing can loosen a running month.
 */
export function confirm(plans: Plans, setting: PenaltySetting | null, today: string): Plans | null {
  const state = editState(plans, today);
  const month = monthOf(today);
  if (state.kind === 'locked') return null;
  if (state.kind === 'open') {
    if (setting == null) return null;
    return { ...plans, [month]: { setting, from: today, confirmed: true } };
  }
  return { ...plans, [month]: { setting, from: firstOfMonth(month), confirmed: true } };
}

/** The first day anything was ever charged, or null. */
export function firstChargeDay(plans: Plans): string | null {
  const days = Object.values(plans)
    .filter((p) => p.setting)
    .map((p) => p.from)
    .sort();
  return days[0] ?? null;
}

export interface ChargeDay {
  stamp: string;
  label: string;
  used: number;
  over: number;
  limit: number;
  charge: number;
}

/**
 * Every charged day from the first plan up to yesterday, newest first. Today
 * is left out: it hasn't settled. Days come from the installed usage source,
 * which serves the history it has loaded.
 */
export function chargeLedger(plans: Plans, today: string): ChargeDay[] {
  const first = firstChargeDay(plans);
  if (!first) return [];
  const out: ChargeDay[] = [];
  for (let idx = 1; ; idx++) {
    const stamp = dayStamp(dateAt(idx));
    if (stamp < first) break;
    const setting = settingOn(plans, stamp);
    if (!setting) continue;
    const used = dayUsageAt(idx).reduce((s, v) => s + v, 0);
    out.push({
      stamp,
      label: dayLabel(idx),
      used,
      over: minutesOver(used, setting.limit),
      limit: setting.limit,
      charge: chargeFor(used, setting),
    });
  }
  return out;
}

/** Sum of charges, to the cent. */
export const totalOf = (days: { charge: number }[]) => Math.round(days.reduce((s, d) => s + d.charge, 0) * 100) / 100;
