// Groups: which groups you're in, your group identity, and syncing with the
// group server.
//
// The server holds the truth. This store keeps the last copy it returned, so
// groups still show (with an "as of" time) when the phone is offline.
//
// Sync is automatic. It runs after every usage load (see sync/groupSync.ts),
// from the background task every few hours (sync/groupsBackground.ts), and
// after anything you change. Each sync downloads every group you're in, then
// uploads your recent daily totals to each.
//
// Persisted: your name, your server user id, the cached groups and the
// selection. Not persisted: sync status, an invite waiting for Join, notices
// and drafts.

import { Share } from 'react-native';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { dayStamp } from '../clock';
import { Invite, inviteLink, readInvite } from '../groupLink';
import { Group, NAME_MAX, agreeToExclude, declineExclude, selfDays, withdrawExclude } from '../groups';
import { groupsApi } from '../sync/groupsApi';
import { groupsServerConfigured } from '../sync/supabase';
import { usageSource } from '../usage/source';
import { goTo } from './navStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

export const GROUP_NAME_MAX = NAME_MAX;

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'unconfigured';

/** One day's per-app minutes, empty if unknown. See selfDays(). */
export type DayReader = (stamp: string) => Record<string, number>;

/** Reads days from the loaded usage source, and knows nothing until it has loaded. */
const fromLoadedSource: DayReader = (stamp) =>
  usageSource().status === 'ready' ? usageSource().allAppsDay(stamp) : {};

interface GroupsState {
  /** Your anonymous id on the group server. Empty until you first create or join. */
  selfId: string;
  selfName: string;
  groups: Group[];
  groupId: string;
  lastSynced: number;
  syncStatus: SyncStatus;
  /** A create or join is in flight. */
  busy: boolean;
  /** An invite waiting for you to join. */
  incoming: Invite | null;
  /** One line shown at the top of the Groups page. */
  notice: string | null;
  /** Why a pasted link, a join or a create failed. */
  error: string | null;
  ngName: string;
  linkDraft: string;

  select: (groupId: string) => void;
  openSettings: () => void;
  openRules: () => void;
  backToGroups: () => void;
  backToSettings: () => void;
  clearNotice: () => void;
  /** Opens a group's requests to stop tracking, from a tapped notification. */
  openRequests: (groupId: string) => void;

  setSelfName: (name: string) => void;
  openNewGroup: () => void;
  setNgName: (name: string) => void;
  createGroup: () => Promise<void>;
  /** Opens the share sheet with an invite link for the current group. */
  invite: () => Promise<void>;

  /** Uploads your numbers and downloads everyone's. `readDay` defaults to the loaded usage. */
  sync: (readDay?: DayReader) => Promise<void>;

  receive: (text: string) => boolean;
  setLinkDraft: (text: string) => void;
  openLinkDraft: () => void;
  joinIncoming: () => Promise<void>;
  dismissIncoming: () => void;

  proposeExclude: (app: string, label: string) => void;
  withdrawVote: (app: string) => void;
  declineProposal: (app: string) => void;

  leave: () => Promise<void>;
  deleteMyData: () => Promise<void>;
}

export const currentGroup = (s: Pick<GroupsState, 'groups' | 'groupId'>): Group | null =>
  s.groups.find((g) => g.id === s.groupId) || s.groups[0] || null;

/** Network failures read as offline; anything else is reported as it is. */
const describe = (e: unknown): { offline: boolean; message: string } => {
  const message = e instanceof Error ? e.message : String(e);
  return { offline: /network|fetch|timed? ?out|failed to fetch/i.test(message), message };
};

const JOIN_ERRORS: Record<string, string> = {
  'invite-not-found': "That invite doesn't work any more. The group may have been deleted.",
  'group-full': 'That group is full (30 members).',
};

export const useGroupsStore = create<GroupsState>()(
  persist(
    (set, get) => {
      /** Runs `change` on the current group's copy of you, then saves your votes. */
      const vote = (change: (g: Group, selfId: string) => Group) => {
        const s = get();
        const g = currentGroup(s);
        if (!g || !s.selfId) return;
        const updated = change(g, s.selfId);
        set({ groups: s.groups.map((x) => (x.id === g.id ? updated : x)) });
        const me = updated.members.find((m) => m.id === s.selfId);
        if (!me) return;
        groupsApi
          .updateMe(g.id, s.selfId, { excludes: me.excludes, declines: me.declines })
          // The next sync restores the server's view if this didn't land.
          .then(() => get().sync())
          .catch(() => set({ notice: "Your vote couldn't be saved. It'll be retried when you're back online." }));
      };

      let queue = Promise.resolve();

      /** Uploads your numbers (and any new name) to each group. */
      const upload = async (groups: Group[], selfId: string, readDay: DayReader): Promise<void> => {
        const today = dayStamp();
        const selfName = get().selfName.trim();
        for (const g of groups) {
          try {
            const days = selfDays(g, selfId, today, readDay);
            if (Object.keys(days).length > 0) await groupsApi.pushDays(g.id, days);
            const me = g.members.find((m) => m.id === selfId);
            if (me && selfName && me.name !== selfName) await groupsApi.updateMe(g.id, selfId, { name: selfName });
          } catch {
            // One group failing mustn't stop the rest.
          }
        }
      };

      const runSync = async (readDay: DayReader): Promise<void> => {
        if (!groupsServerConfigured()) {
          set({ syncStatus: 'unconfigured' });
          return;
        }
        const s = get();
        // Someone who has never used groups never gets a server identity.
        if (!s.selfId && s.groups.length === 0) return;
        set({ syncStatus: 'syncing' });
        try {
          const selfId = await groupsApi.signIn();
          // Download first, so the upload follows the group's latest rules (an
          // app everyone has just agreed to leave out, say) and reaches a group
          // you've only just joined. Your own row is computed live on this
          // phone, so it needn't be downloaded again afterwards.
          const groups = await groupsApi.fetchGroups();
          await upload(groups, selfId, readDay);
          const keep = groups.some((g) => g.id === get().groupId);
          set({
            selfId,
            groups,
            groupId: keep ? get().groupId : (groups[0]?.id ?? ''),
            lastSynced: Date.now(),
            syncStatus: 'ok',
          });
        } catch (e) {
          set({
            syncStatus: describe(e).offline ? 'offline' : 'idle',
            notice: describe(e).offline ? null : "Couldn't sync: " + describe(e).message,
          });
        }
      };

      return {
        selfId: '',
        selfName: '',
        groups: [],
        groupId: '',
        lastSynced: 0,
        syncStatus: 'idle',
        busy: false,
        incoming: null,
        notice: null,
        error: null,
        ngName: '',
        linkDraft: '',

        select: (groupId) => set({ groupId }),
        openSettings: () => goTo('groupSettings'),
        openRules: () => goTo('groupRules'),
        backToGroups: () => goTo('groups'),
        backToSettings: () => goTo('groupSettings'),
        clearNotice: () => set({ notice: null }),
        openRequests: (groupId) => {
          // Selected even if this phone hasn't seen the group yet: the sync
          // below brings it in, and keeps the selection once it exists.
          set({ groupId });
          goTo('groupRules');
          void get().sync();
        },

        // Saved to the server on the next sync, rather than on every keystroke.
        setSelfName: (name) => set({ selfName: name.slice(0, NAME_MAX) }),

        openNewGroup: () => {
          set({ ngName: '', error: null });
          goTo('newGroup');
        },
        setNgName: (name) => set({ ngName: name.slice(0, NAME_MAX) }),

        createGroup: async () => {
          const s = get();
          const name = s.ngName.trim();
          const selfName = s.selfName.trim();
          if (!name || !selfName || s.busy) return;
          set({ busy: true, error: null });
          try {
            const selfId = await groupsApi.signIn();
            const { id } = await groupsApi.createGroup(name, selfName, dayStamp());
            set({ selfId, groupId: id });
            await get().sync();
            goTo('groups');
            await get().invite();
          } catch (e) {
            set({ error: "Couldn't create the group: " + describe(e).message });
          } finally {
            set({ busy: false });
          }
        },

        invite: async () => {
          const s = get();
          const g = currentGroup(s);
          if (!g?.inviteCode) return;
          const link = inviteLink(g.inviteCode, g.name, s.selfName.trim() || 'A friend');
          await Share.share({
            message:
              `Join my group "${g.name}" on Gauge. Lowest screen time each day wins the point.\n` +
              `Install Gauge, then open this link:\n${link}`,
          });
        },

        // Queued rather than skipped when one is already running: the sync a
        // join starts must still run, or the new group wouldn't show up.
        sync: (readDay = fromLoadedSource) => (queue = queue.then(() => runSync(readDay)).catch(() => {})),

        receive: (text) => {
          const invite = readInvite(text);
          if (!invite) return false;
          const already = get().groups.find((g) => g.inviteCode === invite.code);
          if (already) {
            set({ groupId: already.id, notice: `You're already in "${already.name}".`, linkDraft: '' });
            goTo('groups');
            return true;
          }
          set({ incoming: invite, error: null, linkDraft: '' });
          goTo('groupJoin');
          return true;
        },

        setLinkDraft: (text) => set({ linkDraft: text, error: null }),
        openLinkDraft: () => {
          if (!get().receive(get().linkDraft)) {
            set({ error: "That isn't a Gauge invite link. Paste the whole message you were sent." });
          }
        },

        joinIncoming: async () => {
          const s = get();
          const invite = s.incoming;
          const selfName = s.selfName.trim();
          if (!invite || !selfName || s.busy) return;
          set({ busy: true, error: null });
          try {
            const selfId = await groupsApi.signIn();
            const { id, name } = await groupsApi.joinGroup(invite.code, selfName, dayStamp());
            set({ selfId, groupId: id, incoming: null });
            await get().sync();
            set({ notice: `You joined "${name}". Your numbers now sync automatically.` });
            goTo('groups');
          } catch (e) {
            const m = describe(e).message;
            set({ error: JOIN_ERRORS[m] ?? "Couldn't join: " + m });
          } finally {
            set({ busy: false });
          }
        },

        dismissIncoming: () => {
          set({ incoming: null, error: null });
          goTo('groups');
        },

        proposeExclude: (app, label) => vote((g, me) => agreeToExclude(g, me, app, label)),
        withdrawVote: (app) => vote((g, me) => withdrawExclude(g, me, app)),
        declineProposal: (app) => vote((g, me) => declineExclude(g, me, app)),

        leave: async () => {
          const s = get();
          const g = currentGroup(s);
          if (!g) return;
          try {
            if (s.selfId) await groupsApi.leaveGroup(g.id, s.selfId);
          } catch (e) {
            set({ notice: "Couldn't leave right now: " + describe(e).message });
            return;
          }
          const groups = get().groups.filter((x) => x.id !== g.id);
          // Out of every group, so nothing more to be notified about. Best
          // effort: the server also drops tokens of anyone in no group.
          if (groups.length === 0) void groupsApi.clearPushToken().catch(() => {});
          // A notice about the group you just left would only confuse.
          set({ groups, groupId: groups[0]?.id ?? '', notice: null });
          goTo('groups');
        },

        deleteMyData: async () => {
          try {
            if (get().selfId) await groupsApi.deleteMyData();
          } catch (e) {
            set({ notice: "Couldn't delete your group data right now: " + describe(e).message });
            return;
          }
          set({
            selfId: '',
            groups: [],
            groupId: '',
            lastSynced: 0,
            syncStatus: 'idle',
            notice: 'Your group data was deleted from the server.',
          });
          goTo('groups');
        },
      };
    },
    {
      name: storageKey('groups'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({
        selfId: s.selfId,
        selfName: s.selfName,
        groups: s.groups,
        groupId: s.groupId,
        lastSynced: s.lastSynced,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<GroupsState> | undefined;
        if (!p) return current;
        // Groups saved by the older, link-based design have no invite code and
        // aren't on the server. Anything that doesn't validate is dropped.
        const groups = Array.isArray(p.groups) ? p.groups.filter(isGroup) : [];
        const ids = new Set(groups.map((g) => g.id));
        return {
          ...current,
          selfId: typeof p.selfId === 'string' ? p.selfId : '',
          selfName: typeof p.selfName === 'string' ? p.selfName.slice(0, NAME_MAX) : '',
          groups,
          groupId: typeof p.groupId === 'string' && ids.has(p.groupId) ? p.groupId : (groups[0]?.id ?? ''),
          lastSynced: typeof p.lastSynced === 'number' ? p.lastSynced : 0,
        };
      },
    }
  )
);

const isStampish = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function isGroup(v: unknown): v is Group {
  const g = v as Partial<Group>;
  return (
    typeof g === 'object' &&
    g !== null &&
    typeof g.id === 'string' &&
    typeof g.name === 'string' &&
    typeof g.inviteCode === 'string' &&
    isStampish(g.created) &&
    Array.isArray(g.members) &&
    g.members.every(
      (m) =>
        typeof m?.id === 'string' &&
        typeof m.name === 'string' &&
        isStampish(m.joined) &&
        typeof m.sharedAt === 'number' &&
        typeof m.days === 'object' &&
        m.days !== null &&
        typeof m.excludes === 'object' &&
        m.excludes !== null &&
        Array.isArray(m.declines)
    )
  );
}
