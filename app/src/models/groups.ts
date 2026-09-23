// Groups: the group page, tracking rules, settings, inviting and new groups.

import { useMemo } from 'react';
import { CATS, CCOL, dateAt, fmtDate, fmtShort, series } from '../data';
import {
  CONTACTS,
  Contact,
  GroupRules,
  MIN_GROUP_SIZE,
  canProposeExclude,
  contactMatches,
  countedTotal,
  groupStats,
  memberIdOf,
} from '../groups';
import { GROUP_NAME_MAX, currentGroup, invitesFor, rulesFor, useGroupsStore } from '../state/groupsStore';
import { ordinal, ranks } from './shared';

export interface PickerContact {
  id: string;
  name: string;
  initial: string;
  hasApp: boolean;
  via: string;
  on: boolean;
  disabled: boolean;
  onPress: (() => void) | undefined;
}

export interface ContactPickerViewModel {
  query: string;
  setQuery: (text: string) => void;
  contacts: PickerContact[];
  summary: string;
  chosen: Contact[];
}

/** Contact list with search and multi-select. `blocked` returns a reason a
 *  contact can't be picked (e.g. already a member), or '' if they can. */
function contactPicker(
  selected: string[],
  query: string,
  set: (ids: string[], query: string) => void,
  blocked: (c: Contact) => string
): ContactPickerViewModel {
  const chosen = CONTACTS.filter((c) => selected.indexOf(c.id) >= 0);
  const nOnApp = chosen.filter((c) => c.hasApp).length;
  const nLink = chosen.length - nOnApp;
  return {
    query,
    setQuery: (t) => set(selected, t),
    contacts: CONTACTS.filter((c) => contactMatches(c, query)).map((c) => {
      const on = selected.indexOf(c.id) >= 0;
      const reason = blocked(c);
      return {
        id: c.id,
        name: c.name,
        initial: c.name[0],
        hasApp: c.hasApp,
        via:
          reason || (c.hasApp ? 'On the app · gets an in-app invite' : 'Not on the app · gets a download link by text'),
        on,
        disabled: reason !== '',
        onPress: reason
          ? undefined
          : () => set(on ? selected.filter((x) => x !== c.id) : selected.concat([c.id]), query),
      };
    }),
    summary:
      chosen.length === 0
        ? 'Nobody selected yet'
        : [
            nOnApp ? nOnApp + ' in-app invite' + (nOnApp > 1 ? 's' : '') : '',
            nLink ? nLink + ' download link' + (nLink > 1 ? 's' : '') : '',
          ]
            .filter(Boolean)
            .join(' · '),
    chosen,
  };
}

const catNames = (ids: string[]) =>
  CATS.filter((c) => ids.indexOf(c.id) >= 0)
    .map((c) => c.name)
    .join(', ');

const rulesLineFor = (excluded: string[]) =>
  excluded.length ? 'Not tracked: ' + catNames(excluded) : 'All categories tracked';

const rulesNoteFor = (rules: GroupRules) => {
  const needsYou = rules.proposals.filter((p) => p.agreed.indexOf('you') < 0).length;
  return needsYou ? needsYou + (needsYou === 1 ? ' proposal needs' : ' proposals need') + ' your vote' : '';
};

export interface GroupTab {
  id: string;
  label: string;
  active: boolean;
  onPress: () => void;
}

export interface RankRow {
  id: string;
  rank: number;
  name: string;
  initial: string;
  color: string;
  you: boolean;
  total: string;
  pct: number;
  top: { name: string; time: string; color: string }[];
}

export interface BoardRow {
  id: string;
  rank: number;
  name: string;
  initial: string;
  color: string;
  you: boolean;
  points: string;
  streak: string;
  best: string;
}

export interface PendingInvite {
  id: string;
  name: string;
  initial: string;
  status: string;
  cancel: (() => void) | undefined;
  accept: () => void;
}

export interface GroupsViewModel {
  empty: boolean;
  openNewGroup: () => void;
  tabs: GroupTab[];
  name: string;
  summary: string;
  since: string;
  today: RankRow[];
  yesterday: string;
  board: BoardRow[];
  boardNote: string;
  settingsNote: string;
  openSettings: () => void;
  pending: PendingInvite[];
  pendingNote: string;
}

const EMPTY_PAGE = {
  name: '',
  summary: '',
  since: '',
  today: [] as RankRow[],
  yesterday: '',
  board: [] as BoardRow[],
  boardNote: '',
  settingsNote: '',
  pending: [] as PendingInvite[],
  pendingNote: '',
};

export function useGroupsModel(): GroupsViewModel {
  const store = useGroupsStore();

  return useMemo(() => {
    const group = currentGroup(store);
    const tabs = store.groups.map((g) => ({
      id: g.id,
      label: g.name + ' · ' + g.members.length,
      active: group != null && g.id === group.id,
      onPress: () => store.select(g.id),
    }));

    if (!group) {
      return { empty: true, openNewGroup: store.openNewGroup, tabs, ...EMPTY_PAGE, openSettings: store.openSettings };
    }

    const rules = rulesFor(store, group.id);
    const excluded = rules.excluded;
    const invites = invitesFor(store, group.id);
    const stats = groupStats(group, excluded);
    const seriesList = series();
    const n = group.members.length;

    const todayRows = group.members
      .map((mem) => ({ mem, per: mem.day(0), total: Math.round(countedTotal(mem.day(0), excluded)) }))
      .sort((a, b) => a.total - b.total || a.mem.name.localeCompare(b.mem.name));
    const todayRanks = ranks(todayRows.map((r) => r.total));
    const todayMax = Math.max(1, ...todayRows.map((r) => r.total));
    const yourRank = todayRanks[todayRows.findIndex((r) => r.mem.id === 'you')];

    const winners = stats.winnersByDay[0] || [];
    const nameOf = (id: string) => group.members.find((mem) => mem.id === id)!.name;
    const winnerTotal = winners.length
      ? Math.round(countedTotal(group.members.find((mem) => mem.id === winners[0])!.day(1), excluded))
      : 0;

    const board = stats.stats.slice().sort((a, b) => b.points - a.points || a.member.name.localeCompare(b.member.name));
    const boardRanks = ranks(board.map((s) => s.points));

    return {
      empty: false,
      openNewGroup: store.openNewGroup,
      tabs,
      name: group.name,
      summary: 'You’re ' + ordinal(yourRank) + ' of ' + n + ' today',
      since: n + (n === 1 ? ' member' : ' members') + ' · since ' + fmtDate(dateAt(group.created)),
      today: todayRows.map((r, i) => ({
        id: r.mem.id,
        rank: todayRanks[i],
        name: r.mem.name,
        initial: r.mem.name[0],
        color: r.mem.color,
        you: r.mem.id === 'you',
        total: fmtShort(r.total),
        pct: Math.max(2, (r.total / todayMax) * 100),
        // Over the member's own usage array, which is one entry per tracked
        // app. Mapping over CATS instead showed only the first eight and
        // labelled them with category names.
        top: r.per
          .map((_, ci) => ci)
          .filter((ci) => r.per[ci] > 0.4 && excluded.indexOf(seriesList[ci]?.id ?? '') < 0)
          .sort((a, b) => r.per[b] - r.per[a])
          .slice(0, 3)
          .map((ci) => ({
            name: seriesList[ci]?.name ?? '',
            time: fmtShort(r.per[ci]),
            color: seriesList[ci]?.color ?? '#8a8f94',
          })),
      })),
      yesterday: winners.length
        ? winners.map(nameOf).join(' & ') +
          (winners.length > 1 ? ' tied for' : ' won') +
          ' yesterday’s point with ' +
          fmtShort(winnerTotal)
        : '',
      board: board.map((s, i) => ({
        id: s.member.id,
        rank: boardRanks[i],
        name: s.member.name,
        initial: s.member.name[0],
        color: s.member.color,
        you: s.member.id === 'you',
        points: s.points + (s.points === 1 ? ' pt' : ' pts'),
        streak: s.streak > 0 ? s.streak + '-day streak' : '',
        best:
          s.member.joined === 0 && group.created > 0 ? 'Joined today · first point at midnight' : 'Best run ' + s.best,
      })),
      boardNote: stats.winnersByDay.length
        ? stats.winnersByDay.length + ' days played'
        : 'First point awarded at midnight',
      settingsNote: rulesNoteFor(rules),
      openSettings: store.openSettings,
      pending: invites.map((inv) => {
        const c = CONTACTS.find((x) => x.id === inv.contactId)!;
        return {
          id: c.id,
          name: c.name,
          initial: c.name[0],
          status: inv.via === 'app' ? 'In-app invite sent' : 'Download link texted to ' + c.phone,
          cancel: n + invites.length > MIN_GROUP_SIZE ? () => store.cancelInvite(c.id) : undefined,
          accept: () => store.acceptInvite(c.id),
        };
      }),
      pendingNote:
        n + invites.length > MIN_GROUP_SIZE
          ? 'They join when they accept'
          : 'A group needs at least ' + MIN_GROUP_SIZE + ' people',
    };
  }, [store]);
}

export interface Vote {
  id: string;
  initial: string;
  color: string;
  agreed: boolean;
}

export interface ProposalRow {
  id: string;
  title: string;
  color: string;
  progress: string;
  waiting: string;
  votes: Vote[];
  youAgreed: boolean;
  agree: () => void;
  decline: () => void;
  withdraw: () => void;
}

export interface RuleCategoryRow {
  id: string;
  name: string;
  color: string;
  off: boolean;
  open: boolean;
  action: string;
  onPress: (() => void) | undefined;
}

export interface GroupRulesViewModel {
  name: string;
  excluded: { id: string; name: string; color: string }[];
  proposals: ProposalRow[];
  categories: RuleCategoryRow[];
  backToSettings: () => void;
}

export function useGroupRulesModel(): GroupRulesViewModel | null {
  const store = useGroupsStore();

  return useMemo(() => {
    const group = currentGroup(store);
    if (!group) return null;

    const rules = rulesFor(store, group.id);
    const excluded = rules.excluded;
    const n = group.members.length;
    const votesFor = (agreed: string[]): Vote[] =>
      group.members.map((mem) => ({
        id: mem.id,
        initial: mem.name[0],
        color: mem.color,
        agreed: agreed.indexOf(mem.id) >= 0,
      }));

    return {
      name: group.name,
      excluded: CATS.map((c, ci) => ({ c, ci }))
        .filter(({ c }) => excluded.indexOf(c.id) >= 0)
        .map(({ c, ci }) => ({ id: c.id, name: c.name, color: CCOL[ci] })),
      proposals: rules.proposals.map((p) => {
        const ci = CATS.findIndex((c) => c.id === p.cat);
        const waiting = group.members.filter((mem) => p.agreed.indexOf(mem.id) < 0).map((mem) => mem.name);
        return {
          id: p.cat,
          title: (p.kind === 'exclude' ? 'Stop tracking ' : 'Track again: ') + CATS[ci].name,
          color: CCOL[ci],
          progress: p.agreed.length + ' of ' + n + ' agreed',
          waiting:
            n < MIN_GROUP_SIZE ? 'Takes effect once invitees join and agree' : 'Waiting on ' + waiting.join(', '),
          votes: votesFor(p.agreed),
          youAgreed: p.agreed.indexOf('you') >= 0,
          agree: () => store.agree(p.cat),
          decline: () => store.declineProposal(p.cat),
          withdraw: () => store.withdrawVote(p.cat),
        };
      }),
      categories: CATS.map((c, ci) => {
        const open = rules.proposals.some((p) => p.cat === c.id);
        const off = excluded.indexOf(c.id) >= 0;
        const lastTracked = !off && !open && !canProposeExclude(rules, c.id);
        return {
          id: c.id,
          name: c.name,
          color: CCOL[ci],
          off,
          open,
          action: open
            ? 'Vote open'
            : off
              ? 'Propose tracking'
              : lastTracked
                ? 'Must track at least one'
                : 'Propose not tracking',
          onPress: open || lastTracked ? undefined : () => store.proposeChange(c.id),
        };
      }),
      backToSettings: store.backToSettings,
    };
  }, [store]);
}

export interface GroupSettingsViewModel {
  name: string;
  members: { id: string; name: string; initial: string; color: string }[];
  memberLine: string;
  inviteNote: string;
  rulesLine: string;
  rulesNote: string;
  openInvite: () => void;
  openRules: () => void;
  leaveConfirm: boolean;
  leaveText: string;
  askLeave: () => void;
  cancelLeave: () => void;
  leave: () => void;
  backToGroups: () => void;
}

export function useGroupSettingsModel(): GroupSettingsViewModel | null {
  const store = useGroupsStore();

  return useMemo(() => {
    const group = currentGroup(store);
    if (!group) return null;

    const rules = rulesFor(store, group.id);
    const invites = invitesFor(store, group.id);
    const n = group.members.length;
    const others = group.members
      .filter((mem) => mem.id !== 'you')
      .map((mem) => mem.name)
      .join(', ');

    return {
      name: group.name,
      members: group.members.map((mem) => ({ id: mem.id, name: mem.name, initial: mem.name[0], color: mem.color })),
      memberLine:
        n +
        (n === 1 ? ' member' : ' members') +
        (invites.length ? ' · ' + invites.length + ' invite' + (invites.length > 1 ? 's' : '') + ' pending' : ''),
      inviteNote: 'Any member can invite people',
      rulesLine: rulesLineFor(rules.excluded),
      rulesNote: rulesNoteFor(rules),
      openInvite: store.openInvite,
      openRules: store.openRules,
      leaveConfirm: store.leaveConfirm,
      leaveText:
        n === 1
          ? 'You’re the only member, so leaving deletes ' + group.name + ' and cancels its pending invites.'
          : n - 1 < MIN_GROUP_SIZE
            ? 'A group needs at least ' +
              MIN_GROUP_SIZE +
              ' people, so leaving ends ' +
              group.name +
              ' for ' +
              others +
              ' too.'
            : 'You’ll drop out of ' +
              group.name +
              '’s rankings and points. The other ' +
              (n - 1) +
              ' stay in the group.',
      askLeave: store.askLeave,
      cancelLeave: store.cancelLeave,
      leave: store.leave,
      backToGroups: store.backToGroups,
    };
  }, [store]);
}

export interface GroupInviteViewModel {
  name: string;
  picker: ContactPickerViewModel;
  canSend: boolean;
  send: () => void;
  backToSettings: () => void;
}

export function useGroupInviteModel(): GroupInviteViewModel | null {
  const store = useGroupsStore();

  return useMemo(() => {
    const group = currentGroup(store);
    if (!group) return null;

    const invites = invitesFor(store, group.id);
    const memberIds = group.members.map((mem) => mem.id);
    const picker = contactPicker(store.ivInvited, store.ivQuery, store.setIvPicked, (c) =>
      memberIds.indexOf(memberIdOf(c)) >= 0
        ? 'Already in ' + group.name
        : invites.some((x) => x.contactId === c.id)
          ? 'Invite already pending'
          : ''
    );

    return {
      name: group.name,
      picker,
      canSend: picker.chosen.length > 0,
      send: store.sendInvites,
      backToSettings: store.backToSettings,
    };
  }, [store]);
}

export interface NewGroupViewModel {
  name: string;
  nameMax: number;
  setName: (text: string) => void;
  categories: { id: string; name: string; color: string; on: boolean; onPress: () => void }[];
  trackedLabel: string;
  picker: ContactPickerViewModel;
  error: string;
  canCreate: boolean;
  create: () => void;
  backToGroups: () => void;
}

export function useNewGroupModel(): NewGroupViewModel {
  const store = useGroupsStore();

  return useMemo(() => {
    const name = store.ngName.trim();
    const nameTaken = store.groups.some((g) => g.name.toLowerCase() === name.toLowerCase());
    const invited = CONTACTS.filter((c) => store.ngInvited.indexOf(c.id) >= 0);
    const error =
      name === ''
        ? 'Give the group a name'
        : nameTaken
          ? 'You already have a group with that name'
          : store.ngTracked.length === 0
            ? 'Track at least one category'
            : invited.length + 1 < MIN_GROUP_SIZE
              ? 'A group needs at least ' + MIN_GROUP_SIZE + ' people, so invite at least one'
              : '';

    return {
      name: store.ngName,
      nameMax: GROUP_NAME_MAX,
      setName: store.setNgName,
      categories: CATS.map((c, ci) => ({
        id: c.id,
        name: c.name,
        color: CCOL[ci],
        on: store.ngTracked.indexOf(c.id) >= 0,
        onPress: () => store.toggleNgCategory(c.id),
      })),
      trackedLabel: store.ngTracked.length + ' of ' + CATS.length + ' tracked',
      picker: contactPicker(store.ngInvited, store.ngQuery, store.setNgPicked, () => ''),
      error,
      canCreate: error === '',
      create: store.createGroup,
      backToGroups: store.backToGroups,
    };
  }, [store]);
}
