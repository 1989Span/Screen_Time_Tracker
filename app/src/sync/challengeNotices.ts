// Time challenge notifications worked out on this phone: each day's result,
// and the winner when the month closes. ("Challenge started" comes from the
// server, which is where the last acceptance lands.)
//
// Run after every sync, including the hourly one with the app closed, so a
// day is announced soon after everyone's numbers for it are in. Each day is
// announced once: the latest one shown is remembered per challenge
// (groupsStore.challengeSeen), and 'final' once the winner has been.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { Challenge, ChallengeResult, challengeResult, currentChallenge } from '../challenge';
import { dayStamp } from '../clock';
import { fmtMoney } from '../data';
import { DayValue, Group, selfDays } from '../groups';
import { DayReader, useGroupsStore } from '../state/groupsStore';

export const CHALLENGE_CHANNEL = 'group-challenge';
export const FINAL = 'final';
/** The most days announced at once, after a phone was off for a while. */
const MAX_DAYS = 3;

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
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
const shortDay = (stamp: string) => MONTH[Number(stamp.slice(5, 7)) - 1] + ' ' + Number(stamp.slice(8, 10));

export interface Notice {
  title: string;
  body: string;
  groupId: string;
}

function names(g: Group, selfId: string, ids: string[]): string {
  const list = ids.map((id) =>
    id === selfId ? 'you' : (g.members.find((m) => m.id === id)?.name.split(' ')[0] ?? 'someone')
  );
  const text = list.length <= 1 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function dayNotices(g: Group, c: Challenge, r: ChallengeResult, selfId: string, since: string | undefined): Notice[] {
  const scored = [...r.days].reverse().filter((d) => d.unscored === null);
  // Seen for the first time (a new install, say): just the latest day.
  const fresh = since === undefined ? scored.slice(-1) : scored.filter((d) => d.day > since);
  let pool = 0;
  const poolThrough = new Map<string, number>();
  for (const d of scored) {
    pool = Math.round((pool + c.fee * d.payers.length) * 100) / 100;
    poolThrough.set(d.day, pool);
  }
  return fresh.slice(-MAX_DAYS).map((d) => {
    const you = d.winners.includes(selfId)
      ? d.winners.length > 1
        ? 'You tied for lowest and paid nothing.'
        : 'You won the day and paid nothing.'
      : d.payers.includes(selfId)
        ? names(g, selfId, d.winners) +
          (d.winners.length > 1 ? ' tied for lowest.' : ' won the day.') +
          ' You paid ' +
          fmtMoney(c.fee) +
          '.'
        : names(g, selfId, d.winners) + ' won the day. Your numbers didn’t arrive, so you sat it out.';
    return {
      title: g.name + ' challenge · ' + shortDay(d.day),
      body: you + ' Pool: ' + fmtMoney(poolThrough.get(d.day) ?? 0) + '.',
      groupId: g.id,
    };
  });
}

function finalNotice(g: Group, c: Challenge, r: ChallengeResult, selfId: string): Notice {
  const month = MONTH_LONG[Number(c.month.slice(5, 7)) - 1];
  const who = names(g, selfId, r.winners);
  const pts = r.points[r.winners[0]] ?? 0;
  const points = pts + (pts === 1 ? ' point' : ' points');
  const body =
    r.pool === 0 || r.winners.length === 0
      ? 'Nobody paid anything into the pool.'
      : r.winners.length === 1
        ? who + ' won ' + fmtMoney(r.pool) + ' with ' + points + '.'
        : who + ' tied on ' + points + ' and split ' + fmtMoney(r.pool) + ': ' + fmtMoney(r.share) + ' each.';
  return { title: month + '’s challenge in ' + g.name + ' is over', body: body + ' (Paper money.)', groupId: g.id };
}

/**
 * What to announce now, for every group's challenge you're playing in, and
 * the updated record of what has been announced. Pure, so tested.
 */
export function challengeNotices(
  groups: Group[],
  selfId: string,
  today: string,
  seen: Record<string, string>,
  valueOf: (g: Group) => DayValue
): { notices: Notice[]; seen: Record<string, string> } {
  const notices: Notice[] = [];
  const next = { ...seen };
  for (const g of groups) {
    const c = currentChallenge(g.challenges, today);
    if (!c || c.status !== 'active' || !c.players.includes(selfId) || seen[c.id] === FINAL) continue;
    const r = challengeResult(g, c, today, valueOf(g));
    const days = dayNotices(g, c, r, selfId, seen[c.id]);
    notices.push(...days);
    const latest = r.days.find((d) => d.unscored === null)?.day;
    if (latest) next[c.id] = latest;
    if (r.finished) {
      notices.push(finalNotice(g, c, r, selfId));
      next[c.id] = FINAL;
    }
  }
  return { notices, seen: next };
}

/** Works out and shows any challenge notifications due. `readDay` supplies your own usage. */
export async function postChallengeNotices(readDay: DayReader): Promise<void> {
  if (Platform.OS !== 'android') return;
  const s = useGroupsStore.getState();
  if (!s.selfId || s.groups.length === 0) return;
  const today = dayStamp();
  const { notices, seen } = challengeNotices(s.groups, s.selfId, today, s.challengeSeen, (g) => {
    const mine = selfDays(g, s.selfId, today, readDay);
    return (m, day) => (m.id === s.selfId ? mine[day] : m.days[day]);
  });
  // Remembered first, so a failure to show one can't repeat it every hour.
  for (const [id, through] of Object.entries(seen)) {
    if (s.challengeSeen[id] !== through) s.markChallengeSeen(id, through);
  }
  if (notices.length === 0) return;
  await Notifications.setNotificationChannelAsync(CHALLENGE_CHANNEL, {
    name: 'Time challenges',
    description: 'Challenge proposals, each day’s result, and the winner at the end of the month.',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  for (const n of notices) {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: { kind: 'challenge', groupId: n.groupId } },
      trigger: { channelId: CHALLENGE_CHANNEL },
    });
  }
}
