// Everything Groups asks of the server.
//
// Thin on purpose. Who may read or write what is enforced by the database
// (supabase/migrations/0001_groups.sql), and scoring stays on the phone
// (groups.ts). Exported as one object so tests can replace its methods.

import { cleanText } from '../groupLink';
import { Group, Member, NAME_MAX } from '../groups';
import { ensureSession, signOutLocally, supabase } from './supabase';

/** The free tier returns at most 1000 rows per request, so reads are paged. */
const PAGE = 1000;

interface GroupRow {
  id: string;
  name: string;
  created_day: string;
  invite_code: string;
}
interface MemberRow {
  group_id: string;
  user_id: string;
  name: string;
  joined_day: string;
  excludes: Record<string, string> | null;
  declines: string[] | null;
}
interface RequestRow {
  group_id: string;
  app: string;
  requested_by: string;
}
interface DayRow {
  group_id: string;
  user_id: string;
  day: string;
  minutes: number;
  updated_at: string;
}

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase()
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

/** Anything another member's phone supplied is cleaned before it's shown. */
const safeName = (s: string) => cleanText(s, NAME_MAX) ?? '?';

/** The rows the database lets you see, which are the groups you're in, as domain groups. */
export function buildGroups(
  groups: GroupRow[],
  members: MemberRow[],
  days: DayRow[],
  requests: RequestRow[] = []
): Group[] {
  const daysOf = new Map<string, Record<string, number>>();
  // When each member last uploaded numbers. (The member row's updated_at also
  // moves on a vote or rename, so it would overstate how fresh the numbers are.)
  const uploadedAt = new Map<string, number>();
  for (const d of days) {
    const key = d.group_id + '/' + d.user_id;
    const map = daysOf.get(key) ?? {};
    map[d.day] = d.minutes;
    daysOf.set(key, map);
    uploadedAt.set(key, Math.max(uploadedAt.get(key) ?? 0, Date.parse(d.updated_at) || 0));
  }
  return groups.map((g) => ({
    id: g.id,
    name: safeName(g.name),
    created: g.created_day,
    inviteCode: g.invite_code,
    requestedBy: Object.fromEntries(requests.filter((r) => r.group_id === g.id).map((r) => [r.app, r.requested_by])),
    members: members
      .filter((m) => m.group_id === g.id)
      .map((m): Member => ({
        id: m.user_id,
        name: safeName(m.name),
        joined: m.joined_day,
        sharedAt: uploadedAt.get(g.id + '/' + m.user_id) ?? 0,
        days: daysOf.get(g.id + '/' + m.user_id) ?? {},
        excludes: Object.fromEntries(
          Object.entries(m.excludes ?? {}).map(([app, label]) => [app, cleanText(label, 60) ?? app])
        ),
        declines: m.declines ?? [],
      })),
  }));
}

export const groupsApi = {
  /** Signs in anonymously if needed. Returns your user id. */
  signIn: ensureSession,

  /** Every group you're in, with its roster and daily totals. */
  async fetchGroups(): Promise<Group[]> {
    const [groups, members, days, requests] = await Promise.all([
      selectAll<GroupRow>('groups', 'id, name, created_day, invite_code'),
      selectAll<MemberRow>('members', 'group_id, user_id, name, joined_day, excludes, declines'),
      selectAll<DayRow>('days', 'group_id, user_id, day, minutes, updated_at'),
      // Optional: a server without migration 0002 has no requests table, and
      // groups must still sync against it. Votes then just show no requester.
      selectAll<RequestRow>('stop_requests', 'group_id, app, requested_by').catch(() => [] as RequestRow[]),
    ]);
    return buildGroups(groups, members, days, requests);
  },

  async createGroup(name: string, memberName: string, today: string): Promise<{ id: string; inviteCode: string }> {
    const { data, error } = await supabase().rpc('create_group', {
      p_name: name,
      p_member_name: memberName,
      p_today: today,
    });
    if (error) throw error;
    const row = (data as { id: string; invite_code: string }[])[0];
    return { id: row.id, inviteCode: row.invite_code };
  },

  /** Joins with an invite code. Throws 'invite-not-found' or 'group-full' for those cases. */
  async joinGroup(code: string, memberName: string, today: string): Promise<{ id: string; name: string }> {
    const { data, error } = await supabase().rpc('join_group', {
      p_code: code,
      p_member_name: memberName,
      p_today: today,
    });
    if (error) {
      if (error.code === 'P0002') throw new Error('invite-not-found');
      if (error.code === 'P0001') throw new Error('group-full');
      throw error;
    }
    return (data as { id: string; name: string }[])[0];
  },

  /** Uploads your daily totals for one group: day stamp -> minutes. */
  async pushDays(groupId: string, days: Record<string, number>): Promise<void> {
    const { error } = await supabase().rpc('push_days', { p_group: groupId, p_days: days });
    if (error) throw error;
  },

  /** Updates your name or votes in one group. The database lets you change only these. */
  async updateMe(
    groupId: string,
    selfId: string,
    patch: { name?: string; excludes?: Record<string, string>; declines?: string[] }
  ): Promise<void> {
    const { error } = await supabase().from('members').update(patch).eq('group_id', groupId).eq('user_id', selfId);
    if (error) throw error;
  },

  async leaveGroup(groupId: string, selfId: string): Promise<void> {
    const { error } = await supabase().from('members').delete().eq('group_id', groupId).eq('user_id', selfId);
    if (error) throw error;
  },

  /** Registers this phone's Expo push token for group request notifications. */
  async setPushToken(token: string): Promise<void> {
    const { error } = await supabase().rpc('set_push_token', { p_token: token });
    if (error) throw error;
  },

  /** Stops group notifications to this phone. */
  async clearPushToken(): Promise<void> {
    const { error } = await supabase().rpc('clear_push_token');
    if (error) throw error;
  },

  /** Deletes your memberships, daily totals and anonymous user on the server. */
  async deleteMyData(): Promise<void> {
    const { error } = await supabase().rpc('delete_my_data');
    if (error) throw error;
    await signOutLocally();
  },
};
