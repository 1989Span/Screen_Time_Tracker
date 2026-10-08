// Time challenges: a month of daily stakes between group members. Paper money.
//
// The server records the challenge and the votes (supabase/migrations/
// 0004_time_challenges.sql). Everything below is worked out on each phone from
// the group's daily totals, with the same scoring as points (groups.ts), so
// every phone agrees:
//
//  * It starts the day the last member accepts and ends on the last day of
//    that month. Only the members in the group when it started play.
//  * Each scored day, the players with the lowest time (all of them, on a tie)
//    win a point and pay nothing. Every other player pays the fee into the pool.
//  * A player whose numbers never arrive sits the day out: no point, no fee.
//  * A player who leaves the group drops out, and what they paid in goes with
//    them: the server deletes their totals when they leave.
//  * When every day is scored after the month ends, the most points takes the
//    pool, split evenly between everyone tied for most.

import { DayValue, Group, shiftStamp, standings } from './groups';

export type ChallengeStatus = 'proposed' | 'active' | 'declined' | 'withdrawn';

export interface Challenge {
  id: string;
  groupId: string;
  /** The month it runs in, as its 1st day (YYYY-MM-01). */
  month: string;
  /** Paper dollars each losing player pays per day. */
  fee: number;
  proposedBy: string | null;
  status: ChallengeStatus;
  /** The day it started (YYYY-MM-DD), once everyone accepted. */
  startDay: string | null;
  /** Member ids playing, fixed when it started. */
  players: string[];
  accepted: string[];
  declined: string[];
}

export function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return month.slice(0, 8) + String(new Date(y, m, 0).getDate()).padStart(2, '0');
}

export interface ChallengeDay {
  day: string;
  /** Won the point and paid nothing. */
  winners: string[];
  /** Paid the fee. */
  payers: string[];
  /** Numbers never arrived: no point, no fee. */
  satOut: string[];
  /** Not scored yet: waiting for someone's numbers, or too few players with numbers. */
  unscored: null | 'waiting' | 'too-few';
}

export interface ChallengeResult {
  /** Newest first, from the start up to yesterday (or the last day). */
  days: ChallengeDay[];
  points: Record<string, number>;
  /** What each player has paid in. */
  paid: Record<string, number>;
  pool: number;
  /** The month is over and every day is scored. */
  finished: boolean;
  /** Most points, once finished. */
  winners: string[];
  /** Each winner's share of the pool, once finished. */
  share: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

const EMPTY: ChallengeResult = { days: [], points: {}, paid: {}, pool: 0, finished: false, winners: [], share: 0 };

/** Days, points, payments and the pool for an active challenge, as of today. */
export function challengeResult(g: Group, c: Challenge, today: string, value: DayValue): ChallengeResult {
  if (c.status !== 'active' || !c.startDay) return EMPTY;
  const end = lastDayOf(c.month);
  // Scored like points, but among the players only, from the start day. Scored
  // up to today, not to the last day, so the grace period for late numbers
  // still runs out after the month ends; days past the end are then dropped.
  const players = g.members.filter((m) => c.players.includes(m.id));
  const st = standings({ ...g, created: c.startDay, members: players }, today, value);

  const points: Record<string, number> = {};
  const paid: Record<string, number> = {};
  for (const p of players) {
    points[p.id] = 0;
    paid[p.id] = 0;
  }
  const days: ChallengeDay[] = st.days
    .filter((d) => d.day <= end)
    .map((d) => {
      if (d.unscored !== null) {
        return { day: d.day, winners: [], payers: [], satOut: d.missing, unscored: d.unscored };
      }
      const competing = players.filter((p) => p.joined <= d.day && !d.missing.includes(p.id)).map((p) => p.id);
      const payers = competing.filter((id) => !d.winners.includes(id));
      for (const id of d.winners) points[id]++;
      for (const id of payers) paid[id] = cents(paid[id] + c.fee);
      return { day: d.day, winners: d.winners, payers, satOut: d.missing, unscored: null };
    });

  const pool = cents(Object.values(paid).reduce((s, v) => s + v, 0));
  const finished = today > end && days.every((d) => d.unscored !== 'waiting');
  const most = Math.max(0, ...Object.values(points));
  const winners = finished && players.length > 0 ? players.filter((p) => points[p.id] === most).map((p) => p.id) : [];
  return {
    days,
    points,
    paid,
    pool,
    finished,
    winners,
    share: winners.length > 0 ? cents(pool / winners.length) : 0,
  };
}

export const monthStart = (stamp: string) => stamp.slice(0, 7) + '-01';

/**
 * The challenge to show: this month's, if one is proposed or running; else
 * last month's that ran, so its result stays up until the next one starts.
 */
export function currentChallenge(challenges: Challenge[] | undefined, today: string): Challenge | null {
  if (!challenges?.length) return null;
  const month = monthStart(today);
  const live = challenges.find((c) => c.month === month && (c.status === 'proposed' || c.status === 'active'));
  if (live) return live;
  const lastMonth = monthStart(shiftStamp(month, -1));
  return challenges.find((c) => c.month === lastMonth && c.status === 'active') ?? null;
}
