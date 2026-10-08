// Small helpers shared by the group page and the time challenge.

import { DayValue, Group, Member, selfDays } from '../groups';
import { usageSource } from '../usage/source';

export const firstName = (m: Member) => m.name.split(' ')[0];

export const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

export const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Every member's number for a day: yours live from this phone, everyone else's as synced. */
export function valueFor(g: Group, selfId: string, today: string): DayValue {
  const mine = selfDays(g, selfId, today, (stamp) =>
    usageSource().status === 'ready' ? usageSource().allAppsDay(stamp) : {}
  );
  return (m: Member, day: string) => (m.id === selfId ? mine[day] : m.days[day]);
}
