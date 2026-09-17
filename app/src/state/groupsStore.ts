// Groups: membership, per-group tracking rules, pending invites, and the
// drafts behind the New group and Invite screens.

import { create } from 'zustand';
import { CATS } from '../data';
import {
  CONTACTS,
  Contact,
  GROUPS,
  Group,
  GroupRules,
  INITIAL_RULES,
  Invite,
  MIN_GROUP_SIZE,
  decline,
  joinGroup,
  makeGroup,
  propose,
  vote,
  withdraw,
} from '../groups';
import { goTo } from './navStore';

export const GROUP_NAME_MAX = 30;

export const toInvite = (c: Contact): Invite => ({ contactId: c.id, via: c.hasApp ? 'app' : 'link' });

interface GroupsState {
  groups: Group[];
  groupId: string;
  rules: Record<string, GroupRules>;
  invites: Record<string, Invite[]>;
  leaveConfirm: boolean;
  // New group draft
  ngName: string;
  ngTracked: string[];
  ngInvited: string[];
  ngQuery: string;
  // Invite-to-existing-group draft
  ivInvited: string[];
  ivQuery: string;

  select: (groupId: string) => void;
  openSettings: () => void;
  openRules: () => void;
  backToGroups: () => void;
  backToSettings: () => void;

  agree: (cat: string) => void;
  declineProposal: (cat: string) => void;
  withdrawVote: (cat: string) => void;
  proposeChange: (cat: string) => void;

  cancelInvite: (contactId: string) => void;
  acceptInvite: (contactId: string) => void;
  askLeave: () => void;
  cancelLeave: () => void;
  leave: () => void;

  openNewGroup: () => void;
  setNgName: (name: string) => void;
  toggleNgCategory: (catId: string) => void;
  setNgPicked: (ids: string[], query: string) => void;
  createGroup: () => void;

  openInvite: () => void;
  setIvPicked: (ids: string[], query: string) => void;
  sendInvites: () => void;
}

const emptyRules: GroupRules = { excluded: [], proposals: [] };

export const currentGroup = (s: Pick<GroupsState, 'groups' | 'groupId'>): Group | null =>
  s.groups.find((g) => g.id === s.groupId) || s.groups[0] || null;

export const rulesFor = (s: Pick<GroupsState, 'rules'>, groupId: string): GroupRules => s.rules[groupId] || emptyRules;

export const invitesFor = (s: Pick<GroupsState, 'invites'>, groupId: string): Invite[] => s.invites[groupId] || [];

/** Applies `change` to the current group's rules. */
const editRules = (change: (g: Group, r: GroupRules) => GroupRules) => (s: GroupsState) => {
  const group = currentGroup(s);
  if (!group) return {};
  return { rules: { ...s.rules, [group.id]: change(group, rulesFor(s, group.id)) } };
};

export const useGroupsStore = create<GroupsState>((set, get) => ({
  groups: GROUPS,
  groupId: GROUPS[0].id,
  rules: INITIAL_RULES,
  invites: {},
  leaveConfirm: false,
  ngName: '',
  ngTracked: CATS.map((c) => c.id),
  ngInvited: [],
  ngQuery: '',
  ivInvited: [],
  ivQuery: '',

  select: (groupId) => set({ groupId }),
  openSettings: () => {
    set({ leaveConfirm: false });
    goTo('groupSettings');
  },
  openRules: () => goTo('groupRules'),
  backToGroups: () => {
    set({ leaveConfirm: false });
    goTo('groups');
  },
  backToSettings: () => goTo('groupSettings'),

  agree: (cat) => set(editRules((g, r) => vote(g, r, cat, 'you'))),
  declineProposal: (cat) => set(editRules((g, r) => decline(r, cat))),
  withdrawVote: (cat) => set(editRules((g, r) => withdraw(r, cat, 'you'))),
  proposeChange: (cat) => set(editRules((g, r) => propose(g, r, cat, 'you'))),

  cancelInvite: (contactId) =>
    set((s) => {
      const group = currentGroup(s);
      if (!group) return {};
      const invites = invitesFor(s, group.id);
      // Cancelling can't take the group below the minimum size.
      if (group.members.length + invites.length <= MIN_GROUP_SIZE) return {};
      return { invites: { ...s.invites, [group.id]: invites.filter((i) => i.contactId !== contactId) } };
    }),

  // Demo only: stands in for the invitee accepting on their own phone.
  acceptInvite: (contactId) =>
    set((s) => {
      const group = currentGroup(s);
      const contact = CONTACTS.find((c) => c.id === contactId);
      if (!group || !contact) return {};
      return {
        groups: s.groups.map((g) => (g.id === group.id ? joinGroup(g, contact) : g)),
        invites: { ...s.invites, [group.id]: invitesFor(s, group.id).filter((i) => i.contactId !== contactId) },
      };
    }),

  askLeave: () => set({ leaveConfirm: true }),
  cancelLeave: () => set({ leaveConfirm: false }),
  leave: () =>
    set((s) => {
      const group = currentGroup(s);
      if (!group) return {};
      const groups = s.groups.filter((g) => g.id !== group.id);
      const invites = { ...s.invites };
      delete invites[group.id];
      goTo('groups');
      return { groups, invites, groupId: groups.length ? groups[0].id : '', leaveConfirm: false };
    }),

  openNewGroup: () => {
    set({ ngName: '', ngTracked: CATS.map((c) => c.id), ngInvited: [], ngQuery: '' });
    goTo('newGroup');
  },
  setNgName: (name) => set({ ngName: name.slice(0, GROUP_NAME_MAX) }),
  toggleNgCategory: (catId) =>
    set((s) => ({
      ngTracked: s.ngTracked.indexOf(catId) >= 0 ? s.ngTracked.filter((x) => x !== catId) : s.ngTracked.concat([catId]),
    })),
  setNgPicked: (ids, query) => set({ ngInvited: ids, ngQuery: query }),
  createGroup: () => {
    const s = get();
    const name = s.ngName.trim();
    const id = 'g-' + Date.now();
    const invited = CONTACTS.filter((c) => s.ngInvited.indexOf(c.id) >= 0);
    set({
      groups: s.groups.concat([makeGroup(id, name)]),
      rules: {
        ...s.rules,
        [id]: { excluded: CATS.filter((c) => s.ngTracked.indexOf(c.id) < 0).map((c) => c.id), proposals: [] },
      },
      invites: { ...s.invites, [id]: invited.map(toInvite) },
      groupId: id,
    });
    goTo('groups');
  },

  openInvite: () => {
    set({ ivInvited: [], ivQuery: '' });
    goTo('groupInvite');
  },
  setIvPicked: (ids, query) => set({ ivInvited: ids, ivQuery: query }),
  sendInvites: () => {
    const s = get();
    const group = currentGroup(s);
    if (!group) return;
    const chosen = CONTACTS.filter((c) => s.ivInvited.indexOf(c.id) >= 0);
    set({
      invites: { ...s.invites, [group.id]: invitesFor(s, group.id).concat(chosen.map(toInvite)) },
      ivInvited: [],
      ivQuery: '',
    });
    goTo('groupSettings');
  },
}));
