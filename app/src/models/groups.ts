// Groups screens: the group page, New group, Join, Settings and Rules.
//
// Your own numbers are computed live from this phone. Everyone else's are
// whatever they last shared. The screens say which is which, and how fresh each
// number is, so a stale share is never mistaken for a live one.

import { useMemo } from 'react';

import { dayStamp } from '../clock';
import { fmtShort } from '../data';
import { Group, Member, MIN_GROUP_SIZE, excludedApps, openProposals, shiftStamp, standings } from '../groups';
import { useAppsStore } from '../state/appsStore';
import { currentGroup, selfDays, useGroupsStore } from '../state/groupsStore';
import { useNow } from '../state/useNow';
import { colorForId } from '../usage/series';
import { usageSource } from '../usage/source';
import { dayStampToDate } from '../usage/ledger';
import { color } from '../theme';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (stamp: string) => {
  const d = dayStampToDate(stamp);
  return d.getDate() + ' ' + MON[d.getMonth()];
};
const clockTime = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0') + (d.getHours() < 12 ? ' am' : ' pm');
};
/** "just now", "12m ago", "3h ago", "yesterday", "4 days ago". */
export const ago = (ms: number, now: number) => {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 2) return 'just now';
  if (m < 60) return m + 'm ago';
  if (m < 24 * 60) return Math.round(m / 60) + 'h ago';
  const days = Math.round(m / (24 * 60));
  return days === 1 ? 'yesterday' : days + ' days ago';
};
const firstName = (m: Member) => m.name.split(' ')[0];
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
const memberColor = (m: Member, selfId: string) => (m.id === selfId ? color.accent : colorForId(m.id));

/** Competition-style ranks: equal values share a rank, the next rank skips. */
function ranks(values: number[]): number[] {
  return values.map((v) => values.filter((x) => x < v).length + 1);
}

/** Every member's number for a day: yours live, everyone else's as shared. */
function valueFor(g: Group, selfId: string, today: string) {
  const mine = selfDays(g, selfId, today);
  return (m: Member, day: string) => (m.id === selfId ? mine[day] : m.days[day]);
}

// --- Group page --------------------------------------------------------------

export interface TodayRow {
  id: string;
  rank: number | null;
  name: string;
  initial: string;
  color: string;
  you: boolean;
  total: string;
  note: string;
  pct: number;
}

export interface BoardRow {
  id: string;
  rank: number;
  name: string;
  initial: string;
  color: string;
  you: boolean;
  points: string;
  detail: string;
}

export interface GroupsViewModel {
  empty: boolean;
  notice: string | null;
  clearNotice: () => void;
  openNewGroup: () => void;
  link: { value: string; onChange: (t: string) => void; open: () => void; error: string | null };
  tabs: { id: string; label: string; active: boolean; onPress: () => void }[];
  since: string;
  today: TodayRow[];
  share: () => void;
  lastShared: string;
  yesterday: string;
  alone: boolean;
  board: BoardRow[];
  openSettings: () => void;
  settingsNote: string;
}

export function useGroupsModel(): GroupsViewModel {
  const store = useGroupsStore();
  const now = useNow();
  const dataVersion = useAppsStore((s) => s.dataVersion);

  return useMemo(() => {
    const link = {
      value: store.linkDraft,
      onChange: store.setLinkDraft,
      open: store.openLinkDraft,
      error: store.linkError,
    };
    const base = {
      notice: store.notice,
      clearNotice: store.clearNotice,
      openNewGroup: store.openNewGroup,
      link,
    };
    const g = currentGroup(store);
    if (!g) {
      return {
        ...base,
        empty: true,
        tabs: [],
        since: '',
        today: [],
        share: () => {},
        lastShared: '',
        yesterday: '',
        alone: true,
        board: [],
        openSettings: () => {},
        settingsNote: '',
      };
    }

    const today = dayStamp();
    const selfId = store.selfId;
    const value = valueFor(g, selfId, today);
    const n = g.members.length;

    // Today so far. Anyone who hasn't shared today is listed, but not ranked.
    const withToday = g.members.map((m) => ({ m, v: value(m, today) }));
    const known = withToday.filter((x) => x.v !== undefined).sort((a, b) => (a.v as number) - (b.v as number));
    const unknown = withToday.filter((x) => x.v === undefined);
    const knownRanks = ranks(known.map((x) => Math.round(x.v as number)));
    const most = Math.max(1, ...known.map((x) => x.v as number));
    const todayRows: TodayRow[] = [...known, ...unknown].map(({ m, v }, i) => ({
      id: m.id,
      rank: v === undefined ? null : knownRanks[i],
      name: m.id === selfId ? 'You' : m.name,
      initial: m.name[0]?.toUpperCase() ?? '?',
      color: memberColor(m, selfId),
      you: m.id === selfId,
      total: v === undefined ? '—' : fmtShort(v),
      note:
        m.id === selfId
          ? 'live on this phone'
          : v === undefined
            ? m.sharedAt > 0
              ? 'last shared ' + ago(m.sharedAt, now)
              : "hasn't shared yet"
            : 'as of ' + clockTime(m.sharedAt),
      pct: v === undefined ? 0 : Math.max(2, (v / most) * 100),
    }));

    const st = standings(g, today, value);
    const yesterday = st.days[0]?.day === shiftStamp(today, -1) ? st.days[0] : undefined;
    const nameOf = (id: string) => {
      const m = g.members.find((x) => x.id === id);
      return !m ? 'someone' : m.id === selfId ? 'you' : firstName(m);
    };
    let yesterdayLine = '';
    if (yesterday?.unscored === null) {
      const low = value(g.members.find((m) => m.id === yesterday.winners[0]) as Member, yesterday.day) ?? 0;
      const sentence =
        listNames(yesterday.winners.map(nameOf)) +
        (yesterday.winners.length > 1 ? ' tied for' : ' won') +
        " yesterday's point with " +
        fmtShort(low) +
        '.';
      yesterdayLine = sentence[0].toUpperCase() + sentence.slice(1);
    } else if (yesterday?.unscored === 'waiting') {
      yesterdayLine = "Yesterday's point is waiting for " + listNames(yesterday.missing.map(nameOf)) + ' to share.';
    }

    const board = [...st.board].sort(
      (a, b) => b.points - a.points || b.streak - a.streak || nameOf(a.memberId).localeCompare(nameOf(b.memberId))
    );
    const boardRanks = ranks(board.map((b) => -b.points));
    const self = g.members.find((m) => m.id === selfId);
    const needsVote = openProposals(g).filter((p) => !p.agreed.includes(selfId) && !p.declined.includes(selfId)).length;

    return {
      ...base,
      empty: false,
      tabs:
        store.groups.length < 2
          ? []
          : store.groups.map((x) => ({
              id: x.id,
              label: x.name,
              active: x.id === g.id,
              onPress: () => store.select(x.id),
            })),
      since: n + (n === 1 ? ' member' : ' members') + ' · since ' + shortDate(g.created),
      today: todayRows,
      share: () => void store.share('update'),
      lastShared:
        self && self.sharedAt > 0
          ? 'You last shared ' + ago(self.sharedAt, now) + '.'
          : "You haven't shared yet. The others only see your numbers when you do.",
      yesterday: yesterdayLine,
      alone: n < MIN_GROUP_SIZE,
      board: board.map((b, i) => {
        const m = g.members.find((x) => x.id === b.memberId) as Member;
        return {
          id: m.id,
          rank: boardRanks[i],
          name: m.id === selfId ? 'You' : m.name,
          initial: m.name[0]?.toUpperCase() ?? '?',
          color: memberColor(m, selfId),
          you: m.id === selfId,
          points: String(b.points),
          detail: (b.streak > 1 ? b.streak + '-day streak · ' : '') + (b.best > 0 ? 'best ' + b.best : 'no wins yet'),
        };
      }),
      openSettings: store.openSettings,
      settingsNote:
        needsVote > 0 ? needsVote + (needsVote === 1 ? ' proposal needs' : ' proposals need') + ' your vote' : '',
    };
    // dataVersion: your live numbers change when usage reloads.
  }, [store, dataVersion, now]);
}

// --- New group ---------------------------------------------------------------

export interface NewGroupViewModel {
  name: string;
  setName: (t: string) => void;
  selfName: string;
  setSelfName: (t: string) => void;
  canCreate: boolean;
  create: () => void;
  back: () => void;
}

export function useNewGroupModel(): NewGroupViewModel {
  const s = useGroupsStore();
  return {
    name: s.ngName,
    setName: s.setNgName,
    selfName: s.selfName,
    setSelfName: s.setSelfName,
    canCreate: s.ngName.trim() !== '' && s.selfName.trim() !== '',
    create: () => void s.createGroup(),
    back: s.backToGroups,
  };
}

// --- Join ----------------------------------------------------------------------

export interface JoinViewModel {
  name: string;
  from: string;
  members: string;
  selfName: string;
  setSelfName: (t: string) => void;
  canJoin: boolean;
  join: () => void;
  notNow: () => void;
}

export function useJoinModel(): JoinViewModel | null {
  const s = useGroupsStore();
  const r = s.incoming;
  if (!r) return null;
  const sender = r.members.find((m) => m.id === r.senderId);
  return {
    name: r.name,
    from: (sender ? sender.name : 'Someone') + ' invited you to compete for the lowest screen time.',
    members: listNames(r.members.map((m) => m.name)),
    selfName: s.selfName,
    setSelfName: s.setSelfName,
    canJoin: s.selfName.trim() !== '',
    join: s.joinIncoming,
    notNow: s.dismissIncoming,
  };
}

// --- Settings ------------------------------------------------------------------

export interface SettingsMember {
  id: string;
  name: string;
  initial: string;
  color: string;
  detail: string;
}

export interface GroupSettingsViewModel {
  name: string;
  members: SettingsMember[];
  invite: () => void;
  rulesNote: string;
  openRules: () => void;
  selfName: string;
  setSelfName: (t: string) => void;
  leaveConfirm: boolean;
  askLeave: () => void;
  cancelLeave: () => void;
  leave: () => void;
  back: () => void;
}

export function useGroupSettingsModel(): GroupSettingsViewModel | null {
  const s = useGroupsStore();
  const now = useNow();
  const g = currentGroup(s);
  if (!g) return null;
  const excluded = excludedApps(g).length;
  const open = openProposals(g).length;
  return {
    name: g.name,
    members: g.members.map((m) => ({
      id: m.id,
      name: m.id === s.selfId ? m.name + ' (you)' : m.name,
      initial: m.name[0]?.toUpperCase() ?? '?',
      color: memberColor(m, s.selfId),
      detail:
        'joined ' +
        shortDate(m.joined) +
        ' · ' +
        (m.sharedAt > 0
          ? 'shared ' + ago(m.sharedAt, now)
          : m.id === s.selfId
            ? "you haven't shared"
            : "hasn't shared"),
    })),
    invite: () => void s.share('invite'),
    rulesNote: [
      excluded === 0 ? 'Every app counts' : excluded + (excluded === 1 ? ' app' : ' apps') + ' left out',
      open > 0 ? open + (open === 1 ? ' proposal' : ' proposals') : '',
    ]
      .filter(Boolean)
      .join(' · '),
    openRules: s.openRules,
    selfName: s.selfName,
    setSelfName: s.setSelfName,
    leaveConfirm: s.leaveConfirm,
    askLeave: s.askLeave,
    cancelLeave: s.cancelLeave,
    leave: s.leave,
    back: s.backToGroups,
  };
}

// --- Rules ---------------------------------------------------------------------

export interface RuleRow {
  app: string;
  label: string;
  detail: string;
  primary?: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}

export interface GroupRulesViewModel {
  excluded: RuleRow[];
  proposals: RuleRow[];
  suggestions: RuleRow[];
  alone: boolean;
  back: () => void;
}

export function useGroupRulesModel(): GroupRulesViewModel | null {
  const s = useGroupsStore();
  const installed = useAppsStore((a) => a.installed);
  const dataVersion = useAppsStore((a) => a.dataVersion);

  return useMemo(() => {
    const g = currentGroup(s);
    if (!g) return null;
    const me = s.selfId;
    const labels = new Map(installed.map((a) => [a.packageName, a.label]));
    const nameOf = (id: string) => {
      const m = g.members.find((x) => x.id === id);
      return !m ? 'someone' : m.id === me ? 'you' : firstName(m);
    };
    // Any member's vote carries the app's label, so an app you don't have still has a name.
    const labelOf = (app: string) => labels.get(app) ?? g.members.map((m) => m.excludes[app]).find(Boolean) ?? app;

    const excludedList = excludedApps(g);
    const proposals = openProposals(g);
    const taken = new Set([...excludedList, ...proposals.map((p) => p.app)]);

    // Suggest the apps you use most, since those are the ones worth debating.
    const today = dayStamp();
    const week: Record<string, number> = {};
    for (let k = 0; k < 7; k++) {
      for (const [app, min] of Object.entries(usageSource().allAppsDay(shiftStamp(today, -k)))) {
        week[app] = (week[app] ?? 0) + min;
      }
    }
    const suggestions = Object.entries(week)
      .filter(([app, min]) => !taken.has(app) && min >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    return {
      alone: g.members.length < MIN_GROUP_SIZE,
      back: s.backToSettings,
      excluded: excludedList.map((app) => ({
        app,
        label: labelOf(app),
        detail: 'Left out for everyone. Anyone can bring it back.',
        primary: { label: 'Bring back', onPress: () => s.withdrawVote(app) },
      })),
      proposals: proposals.map((p) => {
        const youAgreed = p.agreed.includes(me);
        const waiting = g.members.filter((m) => !p.agreed.includes(m.id) && !p.declined.includes(m.id));
        return {
          app: p.app,
          label: p.label,
          detail:
            'Agreed: ' +
            listNames(p.agreed.map(nameOf)) +
            (p.declined.length ? ' · declined: ' + listNames(p.declined.map(nameOf)) : '') +
            (waiting.length ? ' · waiting on ' + listNames(waiting.map((m) => nameOf(m.id))) : ''),
          primary: youAgreed ? undefined : { label: 'Agree', onPress: () => s.proposeExclude(p.app, p.label) },
          secondary: youAgreed
            ? { label: 'Withdraw', onPress: () => s.withdrawVote(p.app) }
            : p.declined.includes(me)
              ? undefined
              : { label: 'Decline', onPress: () => s.declineProposal(p.app) },
        };
      }),
      suggestions: suggestions.map(([app, min]) => ({
        app,
        label: labelOf(app),
        detail: fmtShort(min) + ' in the last 7 days',
        primary: { label: 'Propose', onPress: () => s.proposeExclude(app, labelOf(app)) },
      })),
    };
  }, [s, installed, dataVersion]);
}
