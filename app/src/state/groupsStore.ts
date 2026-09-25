// Groups: which groups you're in, who you are in them, and the actions that
// move numbers between phones.
//
// Persisted: your group identity (a random id plus the name you chose), your
// groups and the one selected. Not persisted: a link waiting for you to join,
// the notice shown after a link is applied, and form drafts.
//
// Nothing is sent anywhere by this store. share() hands a link to the phone's
// own share sheet, and the user picks who gets it.

import { Share } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { dayStamp } from '../clock';
import { ReceivedGroup, groupLink, readGroupLink } from '../groupLink';
import {
  Group,
  Member,
  NAME_MAX,
  SHARE_DAYS,
  agreeToExclude,
  declineExclude,
  excludedApps,
  groupMinutes,
  makeGroup,
  mergeMembers,
  newMember,
  shiftStamp,
  withdrawExclude,
} from '../groups';
import { reloadUsage } from '../usage/bootstrap';
import { usageSource } from '../usage/source';
import { goTo } from './navStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

export const GROUP_NAME_MAX = NAME_MAX;

/** Random id for you or a new group. Unique enough between friends. Not a secret. */
export const randomId = (length = 12): string =>
  Array.from({ length }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

interface GroupsState {
  selfId: string;
  selfName: string;
  groups: Group[];
  groupId: string;
  /** A received link for a group you're not in, waiting for Join. */
  incoming: ReceivedGroup | null;
  /** One line shown after a link was applied or a group created. */
  notice: string | null;
  /** Set when a pasted link couldn't be read. */
  linkError: string | null;
  ngName: string;
  linkDraft: string;

  select: (groupId: string) => void;
  openSettings: () => void;
  openRules: () => void;
  backToGroups: () => void;
  backToSettings: () => void;
  clearNotice: () => void;

  setSelfName: (name: string) => void;
  openNewGroup: () => void;
  setNgName: (name: string) => void;
  createGroup: () => Promise<void>;

  /** Opens the share sheet with a link carrying your latest numbers. */
  share: (purpose: 'update' | 'invite') => Promise<void>;
  /** Applies a group link, or a message containing one. False if it isn't one. */
  receive: (text: string) => boolean;
  setLinkDraft: (text: string) => void;
  openLinkDraft: () => void;
  joinIncoming: () => void;
  dismissIncoming: () => void;

  proposeExclude: (app: string, label: string) => void;
  withdrawVote: (app: string) => void;
  declineProposal: (app: string) => void;

  leave: () => void;
}

export const currentGroup = (s: Pick<GroupsState, 'groups' | 'groupId'>): Group | null =>
  s.groups.find((g) => g.id === s.groupId) || s.groups[0] || null;

/**
 * Your numbers for a group, computed from this phone for the last SHARE_DAYS
 * days you've been in it. Every app counts except the ones the group left out.
 */
export function selfDays(g: Group, selfId: string, today: string): Record<string, number> {
  const self = g.members.find((m) => m.id === selfId);
  if (!self) return {};
  const excluded = excludedApps(g);
  const start = self.joined > g.created ? self.joined : g.created;
  const days: Record<string, number> = {};
  for (let k = 0; k < SHARE_DAYS; k++) {
    const day = shiftStamp(today, -k);
    if (day < start) break;
    days[day] = groupMinutes(usageSource().allAppsDay(day), excluded);
  }
  return days;
}

const firstName = (m: Member) => m.name.split(' ')[0];
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

/** Replaces the current group with `change(group)`. */
const editGroup = (s: GroupsState, change: (g: Group) => Group): Partial<GroupsState> => {
  const g = currentGroup(s);
  if (!g) return {};
  return { groups: s.groups.map((x) => (x.id === g.id ? change(x) : x)) };
};

export const useGroupsStore = create<GroupsState>()(
  persist(
    (set, get) => ({
      selfId: randomId(),
      selfName: '',
      groups: [],
      groupId: '',
      incoming: null,
      notice: null,
      linkError: null,
      ngName: '',
      linkDraft: '',

      select: (groupId) => set({ groupId }),
      openSettings: () => goTo('groupSettings'),
      openRules: () => goTo('groupRules'),
      backToGroups: () => goTo('groups'),
      backToSettings: () => goTo('groupSettings'),
      clearNotice: () => set({ notice: null }),

      setSelfName: (name) =>
        set((s) => {
          const selfName = name.slice(0, NAME_MAX);
          // Your name inside each group follows, so the next share carries it.
          const groups = s.groups.map((g) => ({
            ...g,
            members: g.members.map((m) => (m.id === s.selfId ? { ...m, name: selfName.trim() || m.name } : m)),
          }));
          return { selfName, groups };
        }),

      openNewGroup: () => {
        set({ ngName: '' });
        goTo('newGroup');
      },
      setNgName: (name) => set({ ngName: name.slice(0, NAME_MAX) }),

      createGroup: async () => {
        const s = get();
        const name = s.ngName.trim();
        const selfName = s.selfName.trim();
        if (!name || !selfName) return;
        const today = dayStamp();
        const g = makeGroup(randomId(10), name, today, newMember(s.selfId, selfName, today));
        set({ groups: s.groups.concat([g]), groupId: g.id, notice: null });
        goTo('groups');
        await get().share('invite');
      },

      share: async (purpose) => {
        const g = currentGroup(get());
        if (!g) return;
        // Refresh first, so today's number is as of now rather than as of the
        // last time the app loaded.
        await reloadUsage().catch(() => {});
        const s = get();
        const self = g.members.find((m) => m.id === s.selfId);
        if (!self) return;
        const now = Date.now();
        const fresh: Member = {
          ...self,
          name: s.selfName.trim() || self.name,
          sharedAt: now,
          days: selfDays(g, s.selfId, dayStamp()),
        };
        const link = groupLink(g, fresh);
        const message =
          purpose === 'invite'
            ? `Join my group "${g.name}" on Gauge. Lowest screen time each day wins the point.\n` +
              `Install Gauge, then open this link:\n${link}`
            : `My screen time for "${g.name}" on Gauge. Open to update the group:\n${link}`;
        await Share.share({ message });
        // Remember when you last shared, for the "last shared" line.
        set((st) =>
          editGroup(st, (x) => ({
            ...x,
            members: x.members.map((m) => (m.id === st.selfId ? { ...m, sharedAt: now } : m)),
          }))
        );
      },

      receive: (text) => {
        const r = readGroupLink(text);
        if (!r) return false;
        const s = get();
        const existing = s.groups.find((g) => g.id === r.id);
        const stillMember = existing?.members.some((m) => m.id === s.selfId);
        if (!existing || !stillMember) {
          set({ incoming: r, linkError: null, linkDraft: '' });
          goTo('groupJoin');
          return true;
        }
        const merged = mergeMembers(existing, r.members, s.selfId);
        const updated = r.members
          .filter((m) => m.id !== s.selfId)
          .filter((m) => {
            const before = existing.members.find((x) => x.id === m.id);
            return !before || m.sharedAt > before.sharedAt;
          });
        set({
          groups: s.groups.map((g) => (g.id === r.id ? merged : g)),
          groupId: r.id,
          linkError: null,
          linkDraft: '',
          notice:
            updated.length === 0
              ? `"${existing.name}" is already up to date.`
              : `Updated ${listNames(updated.map(firstName))} in "${existing.name}".`,
        });
        goTo('groups');
        return true;
      },

      setLinkDraft: (text) => set({ linkDraft: text, linkError: null }),
      openLinkDraft: () => {
        const s = get();
        if (!s.receive(s.linkDraft)) {
          set({ linkError: "That isn't a Gauge group link. Paste the whole message you were sent." });
        }
      },

      joinIncoming: () => {
        const s = get();
        const r = s.incoming;
        const selfName = s.selfName.trim();
        if (!r || !selfName) return;
        const today = dayStamp();
        const base = makeGroup(r.id, r.name, r.created, newMember(s.selfId, selfName, today));
        const joined = mergeMembers(base, r.members, s.selfId);
        const sender = r.members.find((m) => m.id === r.senderId);
        set({
          groups: s.groups.filter((g) => g.id !== r.id).concat([joined]),
          groupId: r.id,
          incoming: null,
          notice: `You joined "${r.name}". Tap Share my day so ${sender ? firstName(sender) : 'the others'} can see you.`,
        });
        goTo('groups');
      },

      dismissIncoming: () => {
        set({ incoming: null });
        goTo('groups');
      },

      proposeExclude: (app, label) => set((s) => editGroup(s, (g) => agreeToExclude(g, s.selfId, app, label))),
      withdrawVote: (app) => set((s) => editGroup(s, (g) => withdrawExclude(g, s.selfId, app))),
      declineProposal: (app) => set((s) => editGroup(s, (g) => declineExclude(g, s.selfId, app))),

      leave: () =>
        set((s) => {
          const g = currentGroup(s);
          if (!g) return {};
          const groups = s.groups.filter((x) => x.id !== g.id);
          goTo('groups');
          // A notice about the group you just left would only confuse.
          return { groups, groupId: groups[0]?.id ?? '', notice: null };
        }),
    }),
    {
      name: storageKey('groups'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ selfId: s.selfId, selfName: s.selfName, groups: s.groups, groupId: s.groupId }),
      merge: (persisted, current) => {
        const p = persisted as Partial<GroupsState> | undefined;
        if (!p) return current;
        // Groups saved by the old, contact-based design have a different shape.
        // Anything that doesn't validate is dropped rather than half-loaded.
        const groups = Array.isArray(p.groups) ? p.groups.filter(isGroup) : [];
        const ids = new Set(groups.map((g) => g.id));
        return {
          ...current,
          selfId: typeof p.selfId === 'string' && /^[a-z0-9]{6,32}$/.test(p.selfId) ? p.selfId : current.selfId,
          selfName: typeof p.selfName === 'string' ? p.selfName.slice(0, NAME_MAX) : current.selfName,
          groups,
          groupId: typeof p.groupId === 'string' && ids.has(p.groupId) ? p.groupId : (groups[0]?.id ?? ''),
        };
      },
    }
  )
);

const isStampish = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function isMember(v: unknown): v is Member {
  const m = v as Partial<Member>;
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.id === 'string' &&
    typeof m.name === 'string' &&
    isStampish(m.joined) &&
    typeof m.sharedAt === 'number' &&
    typeof m.days === 'object' &&
    m.days !== null &&
    typeof m.excludes === 'object' &&
    m.excludes !== null &&
    Array.isArray(m.declines)
  );
}

function isGroup(v: unknown): v is Group {
  const g = v as Partial<Group>;
  return (
    typeof g === 'object' &&
    g !== null &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    isStampish(g.created) &&
    Array.isArray(g.members) &&
    g.members.length > 0 &&
    g.members.every(isMember)
  );
}
