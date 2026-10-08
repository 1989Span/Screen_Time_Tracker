// Time challenge: the card on the group page and the challenge screen.

import { useMemo } from 'react';

import { Challenge, ChallengeResult, challengeResult, currentChallenge, lastDayOf, monthStart } from '../challenge';
import { dayStamp } from '../clock';
import { fmtMoney } from '../data';
import { Group, MIN_GROUP_SIZE } from '../groups';
import { useAppsStore } from '../state/appsStore';
import { CHALLENGE_FEE_MAX, CHALLENGE_FEE_MIN, currentGroup, parseFee, useGroupsStore } from '../state/groupsStore';
import { capitalise, firstName, listNames, valueFor } from './groupText';

export const FEE_PRESETS = [0.5, 1, 2, 5];

const MONTH = [
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
/** "October 31" */
const longDay = (stamp: string) => MONTH[Number(stamp.slice(5, 7)) - 1] + ' ' + Number(stamp.slice(8, 10));
const monthName = (stamp: string) => MONTH[Number(stamp.slice(5, 7)) - 1];
const shortDay = (stamp: string) => MONTH[Number(stamp.slice(5, 7)) - 1].slice(0, 3) + ' ' + Number(stamp.slice(8, 10));

function namer(g: Group, selfId: string) {
  return (id: string) => {
    if (id === selfId) return 'you';
    const m = g.members.find((x) => x.id === id);
    return m ? firstName(m) : 'someone';
  };
}

type Stage = 'none' | 'proposed' | 'active' | 'finished';

function stageOf(c: Challenge | null, today: string): Stage {
  if (!c) return 'none';
  if (c.status === 'proposed') return 'proposed';
  return c.month === monthStart(today) ? 'active' : 'finished';
}

/** "Day 9 of 25 · until October 31" */
function progressLine(c: Challenge, today: string): string {
  const end = lastDayOf(c.month);
  const start = c.startDay as string;
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
  return (
    'Day ' + Math.min(days(start, today), days(start, end)) + ' of ' + days(start, end) + ' · until ' + longDay(end)
  );
}

function resultLine(r: ChallengeResult, name: (id: string) => string): string {
  if (!r.finished) return 'Final result once everyone’s last numbers arrive.';
  if (r.winners.length === 0 || r.pool === 0) return 'Nobody paid anything into the pool.';
  return (
    capitalise(listNames(r.winners.map(name))) +
    (r.winners.length === 1 ? ' won ' + fmtMoney(r.pool) : ' tied and split ' + fmtMoney(r.pool)) +
    (r.winners.length > 1 ? ', ' + fmtMoney(r.share) + ' each' : '') +
    '.'
  );
}

// --- Group page card -----------------------------------------------------------

export interface ChallengeCard {
  title: string;
  line: string;
  /** Highlighted when it needs you: a proposal waiting for your answer. */
  needsYou: boolean;
  open: () => void;
}

export function challengeCard(g: Group, selfId: string, today: string, open: () => void): ChallengeCard {
  const c = currentChallenge(g.challenges, today);
  const stage = stageOf(c, today);
  const name = namer(g, selfId);
  if (!c || stage === 'none') {
    return {
      title: 'Time challenge',
      line: 'Put paper money on it: lowest screen time each day pays nothing, most points wins the pool.',
      needsYou: false,
      open,
    };
  }
  if (stage === 'proposed') {
    const answered = c.accepted.includes(selfId) || c.declined.includes(selfId);
    return {
      title: 'Time challenge proposed',
      line:
        capitalise(name(c.proposedBy ?? '')) +
        ' proposed ' +
        fmtMoney(c.fee) +
        ' a day until ' +
        longDay(lastDayOf(c.month)) +
        (answered ? '. Waiting for everyone to accept.' : '. Accept or decline.'),
      needsYou: !answered,
      open,
    };
  }
  const r = challengeResult(g, c, today, valueFor(g, selfId, today));
  if (stage === 'finished') {
    return { title: monthName(c.month) + '’s challenge', line: resultLine(r, name), needsYou: false, open };
  }
  const playing = c.players.includes(selfId);
  return {
    title: 'Time challenge · pool ' + fmtMoney(r.pool),
    line: playing
      ? 'You: ' +
        (r.points[selfId] ?? 0) +
        ' points, paid ' +
        fmtMoney(r.paid[selfId] ?? 0) +
        ' · ' +
        progressLine(c, today)
      : 'You joined after it started. You can play in the next one.',
    needsYou: false,
    open,
  };
}

// --- Challenge screen ----------------------------------------------------------

export interface FeeButton {
  v: number;
  label: string;
  active: boolean;
  onPress: () => void;
}

export interface StandingRow {
  id: string;
  name: string;
  you: boolean;
  points: string;
  paid: string;
  leading: boolean;
}

export interface DayRow {
  label: string;
  text: string;
}

export interface ChallengeViewModel {
  groupName: string;
  stage: Stage;
  busy: boolean;
  error: string | null;
  back: () => void;

  /** Propose form, when there's nothing running this month. */
  propose: {
    possible: boolean;
    note: string;
    presets: FeeButton[];
    feeText: string;
    setFeeText: (t: string) => void;
    feeError: string;
    summary: string;
    submit: () => void;
  } | null;

  /** A proposal waiting on answers. */
  proposal: {
    title: string;
    lines: string[];
    answer: { accept: () => void; decline: () => void } | null;
    withdraw: (() => void) | null;
  } | null;

  /** A running or finished challenge. */
  board: {
    title: string;
    headline: string;
    sub: string;
    notPlaying: string;
    rows: StandingRow[];
    days: DayRow[];
  } | null;

  rules: string[];
}

export function useChallengeModel(): ChallengeViewModel | null {
  const s = useGroupsStore();
  const dataVersion = useAppsStore((a) => a.dataVersion);

  return useMemo(() => {
    const g = currentGroup(s);
    if (!g) return null;
    const today = dayStamp();
    const me = s.selfId;
    const name = namer(g, me);
    const c = currentChallenge(g.challenges, today);
    const stage = stageOf(c, today);
    const until = longDay(lastDayOf(monthStart(today)));

    const feeError = s.chFeeText !== '' && parseFee(s.chFeeText) == null;
    const propose =
      stage === 'none' || stage === 'finished'
        ? {
            possible: g.members.length >= MIN_GROUP_SIZE,
            note:
              g.members.length < MIN_GROUP_SIZE
                ? 'A challenge needs at least two people. Invite someone first.'
                : 'Everyone in ' +
                  g.name +
                  ' has to accept. It starts when the last person does and runs until ' +
                  until +
                  '.',
            presets: FEE_PRESETS.map((v) => ({
              v,
              label: v < 1 ? Math.round(v * 100) + '¢' : '$' + v,
              active: s.chFeeText === '' && s.chFee === v,
              onPress: () => s.setChFee(v),
            })),
            feeText: s.chFeeText,
            setFeeText: s.setChFeeText,
            feeError: feeError
              ? 'Enter an amount from ' + fmtMoney(CHALLENGE_FEE_MIN) + ' to ' + fmtMoney(CHALLENGE_FEE_MAX)
              : '',
            summary:
              fmtMoney(s.chFee) + ' a day from everyone except the day’s lowest screen time, until ' + until + '.',
            submit: () => void s.proposeChallenge(),
          }
        : null;

    let proposal: ChallengeViewModel['proposal'] = null;
    if (c && stage === 'proposed') {
      const waiting = g.members.filter((m) => !c.accepted.includes(m.id)).map((m) => name(m.id));
      const answered = c.accepted.includes(me) || c.declined.includes(me);
      proposal = {
        title: capitalise(name(c.proposedBy ?? '')) + ' proposed ' + fmtMoney(c.fee) + ' a day',
        lines: [
          'Until ' +
            longDay(lastDayOf(c.month)) +
            '. Each day the lowest screen time pays nothing and everyone else pays ' +
            fmtMoney(c.fee) +
            ' into the pool. Most points at the end wins it.',
          'Accepted: ' +
            listNames(c.accepted.map(name)) +
            (waiting.length ? ' · waiting on ' + listNames(waiting) : ''),
        ],
        answer: answered
          ? null
          : { accept: () => void s.respondChallenge(true), decline: () => void s.respondChallenge(false) },
        withdraw: c.proposedBy === me ? () => void s.withdrawChallenge() : null,
      };
    }

    let board: ChallengeViewModel['board'] = null;
    if (c && (stage === 'active' || stage === 'finished')) {
      const r = challengeResult(g, c, today, valueFor(g, me, today));
      const most = Math.max(0, ...Object.values(r.points));
      const rows = c.players
        .filter((id) => g.members.some((m) => m.id === id))
        .map((id) => ({
          id,
          name: id === me ? 'You' : capitalise(name(id)),
          you: id === me,
          points: String(r.points[id] ?? 0),
          paid: fmtMoney(r.paid[id] ?? 0),
          leading: most > 0 && (r.points[id] ?? 0) === most,
        }))
        .sort((a, b) => Number(b.points) - Number(a.points) || a.name.localeCompare(b.name));
      board = {
        title: stage === 'finished' ? monthName(c.month) + '’s challenge' : fmtMoney(c.fee) + ' a day',
        headline: 'Pool ' + fmtMoney(r.pool),
        sub: stage === 'finished' ? resultLine(r, name) : progressLine(c, today),
        notPlaying: c.players.includes(me)
          ? ''
          : 'You joined after this challenge started, so you’re watching this one.',
        rows,
        days: r.days.map((d) => ({
          label: shortDay(d.day),
          text:
            d.unscored === 'waiting'
              ? 'Waiting for ' + listNames(d.satOut.map(name)) + '’s numbers'
              : d.unscored === 'too-few'
                ? 'Not scored: too few numbers arrived'
                : capitalise(listNames(d.winners.map(name))) +
                  (d.winners.length > 1 ? ' tied' : ' won') +
                  (d.payers.length ? ' · ' + fmtMoney(c.fee * d.payers.length) + ' into the pool' : '') +
                  (d.satOut.length ? ' · ' + listNames(d.satOut.map(name)) + ' sat out' : ''),
        })),
      };
    }

    return {
      groupName: g.name,
      stage,
      busy: s.busy,
      error: s.error,
      back: s.backToGroups,
      propose,
      proposal,
      board,
      rules: [
        'Paper money: Gauge keeps the tally, nothing is actually paid.',
        'Each day, whoever has the lowest screen time (everyone tied for lowest) gets a point and pays nothing. Everyone else pays the daily fee into the pool.',
        'If someone’s numbers never arrive for a day, they sit it out: no point, no fee.',
        'At the end of the month, the most points wins the pool, split evenly on a tie.',
        'Anyone who joins the group after a challenge starts plays in the next one.',
      ],
    };
  }, [s, dataVersion]);
}
