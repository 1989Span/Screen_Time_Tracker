// Groups: friends compare screen time.
//
// Each phone uploads its own daily totals to the group server (sync/groupsApi.ts)
// and downloads everyone else's. Every phone then works out the standings itself
// from that data. This file is plain data and arithmetic with no network access,
// so all of it is unit tested.
//
// The rules of the game:
//
//  * Everyone is measured the same way: every app counts, minus any the whole
//    group has agreed to leave out. Personal tracking choices don't apply.
//    People track different apps, so comparing those totals would be unfair,
//    and easy to game by untracking something.
//  * The lowest full-day total wins that day's point. Ties each get a point.
//    Today is "so far" and isn't awarded until it's over.
//  * A day is scored once every member who was in the group that day has synced
//    it, or once it is GRACE_DAYS old, whichever comes first. A missing number
//    never counts as zero, or a phone that failed to sync would win. After the
//    grace period, anyone still missing sits that day out, so one dead phone
//    can't freeze the points for everyone.
//  * Leaving an app out needs every member to agree. Any single member can
//    bring it back by withdrawing their agreement. The first person to ask is
//    recorded by the server, which notifies the group about each request and
//    tells the person who asked how everyone votes
//    (supabase/migrations/0002_stop_tracking_requests.sql).
//  * Members compete from the day they joined.

import { dayStamp } from './clock';
import { dayStampToDate } from './usage/ledger';

export const MIN_GROUP_SIZE = 2;
export const NAME_MAX = 30;

/** Days of your history uploaded on each sync, so a few missed syncs are backfilled. */
export const SHARE_DAYS = 14;

/** How old a day must be before members who never synced it sit it out. */
export const GRACE_DAYS = 2;

export interface Member {
  id: string;
  name: string;
  /** Day stamp (YYYY-MM-DD) of the first day this member competes on. */
  joined: string;
  /** When this member last synced (ms), set by the server. */
  sharedAt: number;
  /** Day stamp -> minutes, as this member's phone uploaded them. */
  days: Record<string, number>;
  /** Apps this member agrees to leave out: package -> label. */
  excludes: Record<string, string>;
  /** Proposals this member has declined (packages). */
  declines: string[];
}

export interface Group {
  id: string;
  name: string;
  /** Day stamp the group was created. */
  created: string;
  /** Everyone in the group, you included (id === your selfId). */
  members: Member[];
  /** The secret that lets someone join. Only members can read it. */
  inviteCode?: string;
  /** Who asked to stop tracking each app: package -> member id. Missing in groups cached before requests existed. */
  requestedBy?: Record<string, string>;
}

// --- Dates ---------------------------------------------------------------------

/** The stamp `n` calendar days after `stamp` (before, if negative). DST-safe. */
export function shiftStamp(stamp: string, n: number): string {
  const d = dayStampToDate(stamp);
  return dayStamp(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// --- Membership --------------------------------------------------------------

export function newMember(id: string, name: string, joined: string): Member {
  return { id, name, joined, sharedAt: 0, days: {}, excludes: {}, declines: [] };
}

/** A new group starts with just you. */
export function makeGroup(id: string, name: string, created: string, self: Member): Group {
  return { id, name, created, members: [self] };
}

/**
 * Your numbers for a group over the last SHARE_DAYS days you've been in it:
 * every app counts except the ones the group left out.
 *
 * `readDay` supplies one day's per-app minutes. In the app that is the loaded
 * usage source; in the background task, which runs without it, it is the
 * history database read directly.
 *
 * A day with nothing recorded is left out rather than reported as zero. An
 * empty read usually means the data isn't loaded, and uploading a zero would
 * overwrite a real number and hand you a win you didn't earn.
 */
export function selfDays(
  g: Group,
  selfId: string,
  today: string,
  readDay: (stamp: string) => Record<string, number>
): Record<string, number> {
  const self = g.members.find((m) => m.id === selfId);
  if (!self) return {};
  const excluded = excludedApps(g);
  const start = self.joined > g.created ? self.joined : g.created;
  const days: Record<string, number> = {};
  for (let k = 0; k < SHARE_DAYS; k++) {
    const day = shiftStamp(today, -k);
    if (day < start) break;
    const perApp = readDay(day);
    if (Object.keys(perApp).length === 0) continue;
    days[day] = groupMinutes(perApp, excluded);
  }
  return days;
}

// --- Leaving apps out --------------------------------------------------------

/** Apps the whole group has agreed to leave out. One person can't decide alone. */
export function excludedApps(g: Group): string[] {
  if (g.members.length < MIN_GROUP_SIZE) return [];
  const [first, ...rest] = g.members;
  return Object.keys(first.excludes)
    .filter((app) => rest.every((m) => app in m.excludes))
    .sort();
}

export interface Proposal {
  app: string;
  label: string;
  agreed: string[];
  declined: string[];
  /** The member who asked, when the server has recorded it. */
  requestedBy?: string;
}

/** Apps some members want left out but not everyone has agreed to yet. */
export function openProposals(g: Group): Proposal[] {
  const excluded = new Set(excludedApps(g));
  const out = new Map<string, Proposal>();
  for (const m of g.members) {
    for (const [app, label] of Object.entries(m.excludes)) {
      if (excluded.has(app)) continue;
      const p = out.get(app) ?? { app, label, agreed: [], declined: [], requestedBy: g.requestedBy?.[app] };
      p.agreed.push(m.id);
      out.set(app, p);
    }
  }
  for (const p of out.values()) {
    p.declined = g.members.filter((m) => m.declines.includes(p.app) && !p.agreed.includes(m.id)).map((m) => m.id);
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
}

const editSelf = (g: Group, selfId: string, change: (m: Member) => Member): Group => ({
  ...g,
  members: g.members.map((m) => (m.id === selfId ? change(m) : m)),
});

/** Ask to stop tracking an app, or agree to someone else's request. */
export function agreeToExclude(g: Group, selfId: string, app: string, label: string): Group {
  return editSelf(g, selfId, (m) => ({
    ...m,
    excludes: { ...m.excludes, [app]: label },
    declines: m.declines.filter((a) => a !== app),
  }));
}

/** Take back your agreement. For an app already left out, this brings it back. */
export function withdrawExclude(g: Group, selfId: string, app: string): Group {
  return editSelf(g, selfId, (m) => {
    const excludes = { ...m.excludes };
    delete excludes[app];
    return { ...m, excludes };
  });
}

/** Vote to keep tracking an app someone asked to stop. The others see it when you next share. */
export function declineExclude(g: Group, selfId: string, app: string): Group {
  return editSelf(withdrawExclude(g, selfId, app), selfId, (m) => ({
    ...m,
    declines: m.declines.includes(app) ? m.declines : m.declines.concat([app]),
  }));
}

/** Minutes that count for the group from one day's per-app totals. */
export function groupMinutes(perApp: Record<string, number>, excluded: readonly string[]): number {
  let total = 0;
  for (const [app, minutes] of Object.entries(perApp)) {
    if (!excluded.includes(app) && Number.isFinite(minutes) && minutes > 0) total += minutes;
  }
  return total;
}

// --- Standings ---------------------------------------------------------------

export interface DayResult {
  day: string;
  /** Ids of the day's winners. Empty when the day wasn't scored. */
  winners: string[];
  /** Why a day wasn't scored, or null if it was. */
  unscored: null | 'too-few' | 'waiting';
  /**
   * Who never synced this day. For a 'waiting' day, the people still awaited.
   * For a scored day, those who sat it out once the grace period ran out.
   */
  missing: string[];
}

export interface Standing {
  memberId: string;
  points: number;
  /** Consecutive scored days won, ending with the latest scored day. */
  streak: number;
  best: number;
}

export interface Standings {
  /** Newest first: yesterday back to the day the group was created. */
  days: DayResult[];
  board: Standing[];
}

/** A member's number for a day, or undefined if they haven't shared it. */
export type DayValue = (member: Member, day: string) => number | undefined;

/**
 * Points, streaks and every settled day, from creation up to yesterday.
 * `value` supplies each member's minutes. For you that is computed live from
 * this phone, and for everyone else it comes from what their phones synced.
 */
export function standings(g: Group, today: string, value: DayValue): Standings {
  const board = new Map<string, Standing>(
    g.members.map((m) => [m.id, { memberId: m.id, points: 0, streak: 0, best: 0 }])
  );
  const graceEnds = shiftStamp(today, -GRACE_DAYS);
  const days: DayResult[] = [];
  for (let day = g.created; day < today; day = shiftStamp(day, 1)) {
    const present = g.members.filter((m) => m.joined <= day);
    if (present.length < MIN_GROUP_SIZE) {
      days.unshift({ day, winners: [], unscored: 'too-few', missing: [] });
      continue;
    }
    const totals = present.map((m) => value(m, day));
    const missing = present.filter((_, i) => totals[i] === undefined).map((m) => m.id);
    if (missing.length > 0 && day > graceEnds) {
      days.unshift({ day, winners: [], unscored: 'waiting', missing });
      continue;
    }
    // Past the grace period, whoever never synced sits the day out.
    const competing = present.filter((_, i) => totals[i] !== undefined);
    if (competing.length < MIN_GROUP_SIZE) {
      days.unshift({ day, winners: [], unscored: 'too-few', missing });
      continue;
    }
    const rounded = competing.map((m) => Math.round(value(m, day) as number));
    const low = Math.min(...rounded);
    const winners = competing.filter((_, i) => rounded[i] === low).map((m) => m.id);
    days.unshift({ day, winners, unscored: null, missing });
    // Streaks run over days a member competed in. A day they sat out, or one
    // nobody could score, neither extends nor breaks theirs.
    for (const m of competing) {
      const s = board.get(m.id) as Standing;
      if (winners.includes(m.id)) {
        s.points++;
        s.streak++;
        s.best = Math.max(s.best, s.streak);
      } else {
        s.streak = 0;
      }
    }
  }
  return { days, board: [...board.values()] };
}
