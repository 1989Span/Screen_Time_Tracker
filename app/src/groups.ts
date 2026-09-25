// Groups: friends compare screen time, sharing their numbers by link.
//
// There is no server. Each person's numbers travel inside links they choose to
// send (see groupLink.ts), and every phone works out the standings itself from
// what it has received. Nothing here talks to a network. It is plain data and
// arithmetic, so all of it is unit tested.
//
// The rules of the game:
//
//  * Everyone is measured the same way: every app counts, minus any the whole
//    group has agreed to leave out. Personal tracking choices don't apply.
//    People track different apps, so comparing those totals would be unfair,
//    and easy to game by untracking something.
//  * The lowest full-day total wins that day's point. Ties each get a point.
//    Today is "so far" and isn't awarded until it's over.
//  * A day is only scored once every member who was in the group that day has
//    shared their number for it. Missing numbers never count as zero. Otherwise
//    whoever forgot to share would win.
//  * Leaving an app out needs every member to agree. Any single member can
//    bring it back by withdrawing their agreement.
//  * Members compete from the day they joined.

import { dayStamp } from './clock';
import { dayStampToDate } from './usage/ledger';

export const MIN_GROUP_SIZE = 2;
export const NAME_MAX = 30;

/** Days of history each share carries, so a few missed shares are backfilled. */
export const SHARE_DAYS = 14;

export interface Member {
  id: string;
  name: string;
  /** Day stamp (YYYY-MM-DD) of the first day this member competes on. */
  joined: string;
  /** When this member made the share we hold (ms). 0 for you: your numbers are live. */
  sharedAt: number;
  /** Day stamp -> minutes, as this member computed and shared them. Empty for you. */
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
 * Folds received members into a group.
 *
 * For each person, the newer share decides their name and votes, so an old link
 * opened late can't roll them back. Days are combined, not replaced: each share
 * carries only the last SHARE_DAYS days, so replacing would drop the older
 * history already collected. Where both have a day, the newer share's number
 * wins. Your own entry is never taken from someone else's copy of it.
 */
export function mergeMembers(g: Group, incoming: Member[], selfId: string): Group {
  const byId = new Map(g.members.map((m) => [m.id, m]));
  for (const m of incoming) {
    if (m.id === selfId) continue;
    const have = byId.get(m.id);
    if (!have) {
      byId.set(m.id, m);
      continue;
    }
    const newer = m.sharedAt > have.sharedAt ? m : have;
    const older = newer === m ? have : m;
    byId.set(m.id, {
      ...newer,
      // Joining is a one-time fact, so the earliest date seen stands.
      joined: have.joined < m.joined ? have.joined : m.joined,
      days: { ...older.days, ...newer.days },
    });
  }
  return { ...g, members: [...byId.values()] };
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
}

/** Apps some members want left out but not everyone has agreed to yet. */
export function openProposals(g: Group): Proposal[] {
  const excluded = new Set(excludedApps(g));
  const out = new Map<string, Proposal>();
  for (const m of g.members) {
    for (const [app, label] of Object.entries(m.excludes)) {
      if (excluded.has(app)) continue;
      const p = out.get(app) ?? { app, label, agreed: [], declined: [] };
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

/** Propose leaving an app out, or agree to someone else's proposal. */
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

/** Say no to someone's proposal. The others see it when you next share. */
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
  /** For a 'waiting' day, who hasn't shared it yet. */
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
 * this phone, and for everyone else it comes from what they shared.
 */
export function standings(g: Group, today: string, value: DayValue): Standings {
  const board = new Map<string, Standing>(
    g.members.map((m) => [m.id, { memberId: m.id, points: 0, streak: 0, best: 0 }])
  );
  const days: DayResult[] = [];
  for (let day = g.created; day < today; day = shiftStamp(day, 1)) {
    const present = g.members.filter((m) => m.joined <= day);
    if (present.length < MIN_GROUP_SIZE) {
      days.unshift({ day, winners: [], unscored: 'too-few', missing: [] });
      continue;
    }
    const totals = present.map((m) => value(m, day));
    const missing = present.filter((_, i) => totals[i] === undefined).map((m) => m.id);
    if (missing.length > 0) {
      days.unshift({ day, winners: [], unscored: 'waiting', missing });
      continue;
    }
    const rounded = totals.map((t) => Math.round(t as number));
    const low = Math.min(...rounded);
    const winners = present.filter((_, i) => rounded[i] === low).map((m) => m.id);
    days.unshift({ day, winners, unscored: null, missing: [] });
    // Streaks run over scored days only. A day nobody could score neither
    // extends nor breaks one.
    for (const m of present) {
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
