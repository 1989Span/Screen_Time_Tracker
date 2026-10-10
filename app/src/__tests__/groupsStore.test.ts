import { Share } from 'react-native';

import { dayStamp } from '../clock';
import { inviteLink, readInvite } from '../groupLink';
import { Group, Member, newMember, shiftStamp } from '../groups';
import { currentGroup, useGroupsStore } from '../state/groupsStore';
import { useNavStore } from '../state/navStore';
import { openFromNotification } from '../sync/groupNotifications';
import { groupsApi } from '../sync/groupsApi';
import { emptySource } from '../usage/emptySource';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';

const store = () => useGroupsStore.getState();
const view = () => useNavStore.getState().view;
const initial = useGroupsStore.getState();

const today = dayStamp();
const CODE = '0123456789abcdef0123456789abcdef';

const me = (over: Partial<Member> = {}): Member => ({ ...newMember('me', 'Stewart', today), ...over });
const alex = (over: Partial<Member> = {}): Member => ({
  ...newMember('alex', 'Alex Kim', shiftStamp(today, -3)),
  sharedAt: Date.now() - 60_000,
  days: { [shiftStamp(today, -1)]: 100 },
  ...over,
});
const family = (members: Member[] = [me(), alex()]): Group => ({
  id: 'g1',
  name: 'Family',
  created: shiftStamp(today, -3),
  inviteCode: CODE,
  members,
});

/** A loaded source whose every day has the same per-app minutes. */
class SameEveryDay implements UsageSource {
  readonly id = 'same';
  readonly status: SourceStatus = 'ready';
  constructor(private readonly perApp: Record<string, number>) {}
  series(): Series[] {
    return [];
  }
  async load() {}
  dayTotals(): number[] {
    return [];
  }
  hourTotals(): number[] {
    return [];
  }
  allAppsDay(): Record<string, number> {
    return { ...this.perApp };
  }
  invalidate() {}
}

/** Stubs every server call; tests override the ones they care about. */
function stubServer() {
  return {
    signIn: jest.spyOn(groupsApi, 'signIn').mockResolvedValue('me'),
    fetchGroups: jest.spyOn(groupsApi, 'fetchGroups').mockResolvedValue([family()]),
    createGroup: jest.spyOn(groupsApi, 'createGroup').mockResolvedValue({ id: 'g1', inviteCode: CODE }),
    joinGroup: jest.spyOn(groupsApi, 'joinGroup').mockResolvedValue({ id: 'g1', name: 'Family' }),
    pushDays: jest.spyOn(groupsApi, 'pushDays').mockResolvedValue(),
    updateMe: jest.spyOn(groupsApi, 'updateMe').mockResolvedValue(),
    leaveGroup: jest.spyOn(groupsApi, 'leaveGroup').mockResolvedValue(),
    deleteMyData: jest.spyOn(groupsApi, 'deleteMyData').mockResolvedValue(),
    clearPushToken: jest.spyOn(groupsApi, 'clearPushToken').mockResolvedValue(),
    proposeChallenge: jest.spyOn(groupsApi, 'proposeChallenge').mockResolvedValue(),
    respondChallenge: jest.spyOn(groupsApi, 'respondChallenge').mockResolvedValue(),
    share: jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never),
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  useGroupsStore.setState({ ...initial, selfId: '', selfName: '', groups: [], groupId: '', syncStatus: 'idle' }, true);
  useNavStore.setState({ view: 'ov' });
  setUsageSource(emptySource);
});

describe('receiving an invite', () => {
  it('asks before joining, and contacts nobody yet', () => {
    const api = stubServer();
    expect(store().receive(inviteLink(CODE, 'Family', 'Alex'))).toBe(true);
    expect(store().incoming).toEqual({ code: CODE, groupName: 'Family', inviter: 'Alex' });
    expect(view()).toBe('groupJoin');
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('needs your name, then joins on the server and syncs', async () => {
    const api = stubServer();
    store().receive(inviteLink(CODE, 'Family', 'Alex'));
    await store().joinIncoming();
    expect(api.joinGroup).not.toHaveBeenCalled(); // no name yet

    store().setSelfName('Stewart');
    await store().joinIncoming();
    expect(api.joinGroup).toHaveBeenCalledWith(CODE, 'Stewart', today);
    expect(store().selfId).toBe('me');
    expect(currentGroup(store())?.name).toBe('Family');
    expect(store().incoming).toBeNull();
    expect(store().notice).toMatch(/sync automatically/);
    expect(view()).toBe('groups');
  });

  it('uploads your numbers to a group the moment you join it', async () => {
    const api = stubServer();
    setUsageSource(new SameEveryDay({ 'com.a': 40 }));
    store().setSelfName('Stewart');
    store().receive(inviteLink(CODE, 'Family', 'Alex'));
    await store().joinIncoming();
    expect(api.pushDays).toHaveBeenCalledWith('g1', { [today]: 40 });
  });

  it("runs a join's sync even while another sync is under way", async () => {
    const api = stubServer();
    let release = () => {};
    const gate = new Promise<void>((open) => (release = open));
    api.fetchGroups.mockImplementationOnce(async () => {
      await gate;
      return [];
    });
    useGroupsStore.setState({ groups: [family()], selfId: 'me' });
    const first = store().sync();
    const second = store().sync();
    release();
    await Promise.all([first, second]);
    expect(api.fetchGroups).toHaveBeenCalledTimes(2);
  });

  it('explains an invite that no longer works', async () => {
    const api = stubServer();
    api.joinGroup.mockRejectedValue(new Error('invite-not-found'));
    store().setSelfName('Stewart');
    store().receive(inviteLink(CODE, 'Family', 'Alex'));
    await store().joinIncoming();
    expect(store().error).toMatch(/doesn't work any more/);
    expect(store().groups).toEqual([]);
  });

  it("just opens a group you're already in", () => {
    stubServer();
    useGroupsStore.setState({ groups: [family()], selfId: 'me' });
    store().receive(inviteLink(CODE, 'Family', 'Alex'));
    expect(store().incoming).toBeNull();
    expect(store().notice).toMatch(/already in/);
  });

  it('rejects a pasted message with no invite in it', () => {
    store().setLinkDraft('hello there');
    store().openLinkDraft();
    expect(store().error).toMatch(/isn't a Gauge invite link/);
  });
});

describe('creating a group', () => {
  it('needs a group name and your name', async () => {
    const api = stubServer();
    store().setNgName('Work');
    await store().createGroup();
    expect(api.createGroup).not.toHaveBeenCalled();
  });

  it('creates it on the server, syncs, and opens an invite', async () => {
    const api = stubServer();
    store().setSelfName('Stewart');
    store().setNgName('Work');
    await store().createGroup();
    expect(api.createGroup).toHaveBeenCalledWith('Work', 'Stewart', today);
    expect(api.share).toHaveBeenCalledTimes(1);
    const message = (api.share.mock.calls[0][0] as { message: string }).message;
    expect(readInvite(message)?.code).toBe(CODE);
  });
});

describe('automatic sync', () => {
  it('downloads everyone, then uploads your numbers to each group', async () => {
    const api = stubServer();
    setUsageSource(new SameEveryDay({ 'com.a': 30, 'com.b': 20 }));
    useGroupsStore.setState({ groups: [family()], selfId: 'me', selfName: 'Stewart' });

    await store().sync();

    // Joined today, so only today goes up: every app counts.
    expect(api.pushDays).toHaveBeenCalledWith('g1', { [today]: 50 });
    expect(api.fetchGroups).toHaveBeenCalled();
    expect(store().syncStatus).toBe('ok');
    expect(store().lastSynced).toBeGreaterThan(0);
  });

  it('never uploads days it has no data for', async () => {
    const api = stubServer();
    // The empty source isn't loaded, so nothing is known.
    useGroupsStore.setState({ groups: [family()], selfId: 'me', selfName: 'Stewart' });
    await store().sync();
    expect(api.pushDays).not.toHaveBeenCalled();
    expect(api.fetchGroups).toHaveBeenCalled();
  });

  it('never signs in someone who has never used groups', async () => {
    const api = stubServer();
    await store().sync();
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('keeps the cached groups when offline, and says so', async () => {
    const api = stubServer();
    api.fetchGroups.mockRejectedValue(new Error('Network request failed'));
    const cached = family();
    useGroupsStore.setState({ groups: [cached], selfId: 'me' });
    await store().sync();
    expect(store().syncStatus).toBe('offline');
    expect(store().groups).toEqual([cached]);
  });

  it('follows rules the group agreed since the last sync', async () => {
    const api = stubServer();
    setUsageSource(new SameEveryDay({ 'com.a': 30, 'com.music': 20 }));
    // This phone last saw only its own vote; the other member has agreed since.
    const agreed = { 'com.music': 'Music' };
    api.fetchGroups.mockResolvedValue([family([me({ excludes: agreed }), alex({ excludes: agreed })])]);
    useGroupsStore.setState({ groups: [family([me({ excludes: agreed }), alex()])], selfId: 'me' });
    await store().sync();
    expect(api.pushDays).toHaveBeenCalledWith('g1', { [today]: 30 });
  });

  it('saves a new name on the next sync', async () => {
    const api = stubServer();
    useGroupsStore.setState({ groups: [family()], selfId: 'me', selfName: 'Stewart' });
    store().setSelfName('Stu');
    await store().sync();
    expect(api.updateMe).toHaveBeenCalledWith('g1', 'me', { name: 'Stu' });
  });

  it('lets one failing group not stop the others', async () => {
    const api = stubServer();
    setUsageSource(new SameEveryDay({ 'com.a': 30 }));
    const other: Group = { ...family(), id: 'g2', inviteCode: 'f'.repeat(32) };
    api.fetchGroups.mockResolvedValue([family(), other]);
    api.pushDays.mockImplementation(async (id) => {
      if (id === 'g1') throw new Error('not a member');
    });
    useGroupsStore.setState({ groups: [family(), other], selfId: 'me' });
    await store().sync();
    expect(api.pushDays).toHaveBeenCalledWith('g2', { [today]: 30 });
    expect(store().syncStatus).toBe('ok');
  });
});

describe('votes, leaving and deleting', () => {
  beforeEach(() => {
    useGroupsStore.setState({ groups: [family()], groupId: 'g1', selfId: 'me', selfName: 'Stewart' });
  });

  it('a vote changes and saves only your own row', () => {
    const api = stubServer();
    store().proposeExclude('com.maps', 'Maps');
    const g = currentGroup(store()) as Group;
    expect(g.members.find((m) => m.id === 'me')?.excludes).toEqual({ 'com.maps': 'Maps' });
    expect(g.members.find((m) => m.id === 'alex')?.excludes).toEqual({});
    expect(api.updateMe).toHaveBeenCalledWith('g1', 'me', { excludes: { 'com.maps': 'Maps' }, declines: [] });
  });

  it('leaving removes you on the server, then here, and clears the notice', async () => {
    const api = stubServer();
    useGroupsStore.setState({ notice: 'old news' });
    await store().leave();
    expect(api.leaveGroup).toHaveBeenCalledWith('g1', 'me');
    expect(store().groups).toEqual([]);
    expect(store().notice).toBeNull();
  });

  it('stops group notifications once you leave your last group', async () => {
    const api = stubServer();
    await store().leave();
    expect(api.clearPushToken).toHaveBeenCalled();
  });

  it('keeps group notifications while you are still in another group', async () => {
    const api = stubServer();
    useGroupsStore.setState({ groups: [family(), { ...family(), id: 'g2', name: 'Work' }] });
    await store().leave();
    expect(store().groups.map((g) => g.id)).toEqual(['g2']);
    expect(api.clearPushToken).not.toHaveBeenCalled();
  });

  it("doesn't pretend to leave when the server can't be reached", async () => {
    const api = stubServer();
    api.leaveGroup.mockRejectedValue(new Error('Network request failed'));
    await store().leave();
    expect(store().groups).toHaveLength(1);
    expect(store().notice).toMatch(/Couldn't leave/);
  });

  it('deleting your data clears everything, including your server identity', async () => {
    const api = stubServer();
    await store().deleteMyData();
    expect(api.deleteMyData).toHaveBeenCalled();
    expect(store().selfId).toBe('');
    expect(store().groups).toEqual([]);
  });
});

describe('time challenges', () => {
  beforeEach(() => {
    useGroupsStore.setState({ groups: [family()], groupId: 'g1', selfId: 'me', selfName: 'Stewart' });
  });

  it('proposes at the chosen fee, for today', async () => {
    const api = stubServer();
    store().setChFee(2);
    await store().proposeChallenge();
    expect(api.proposeChallenge).toHaveBeenCalledWith('g1', 2, dayStamp());
  });

  it('takes a custom fee, and refuses one out of range', async () => {
    const api = stubServer();
    store().setChFeeText('3.50');
    expect(store().chFee).toBe(3.5);
    store().setChFeeText('500');
    await store().proposeChallenge();
    expect(api.proposeChallenge).not.toHaveBeenCalled();
  });

  it('explains when the month already has a challenge', async () => {
    const api = stubServer();
    api.proposeChallenge.mockRejectedValue(new Error('challenge-exists'));
    await store().proposeChallenge();
    expect(store().error).toBe('There’s already a challenge this month.');
  });

  it('shows the server’s own message for an unexpected error', async () => {
    const api = stubServer();
    // Supabase rejects with a plain object, not an Error.
    api.proposeChallenge.mockRejectedValue({
      code: '42883',
      message: 'function public.expo_post(jsonb) does not exist',
    });
    await store().proposeChallenge();
    expect(store().error).toBe("Couldn't propose the challenge: function public.expo_post(jsonb) does not exist");
  });

  it('answers this month’s proposal', async () => {
    const api = stubServer();
    const month = dayStamp().slice(0, 7) + '-01';
    const proposal = {
      id: 'c1',
      groupId: 'g1',
      month,
      fee: 1,
      proposedBy: 'alex',
      status: 'proposed' as const,
      startDay: null,
      players: [],
      accepted: ['alex'],
      declined: [],
    };
    useGroupsStore.setState({ groups: [{ ...family(), challenges: [proposal] }] });
    await store().respondChallenge(true);
    expect(api.respondChallenge).toHaveBeenCalledWith('c1', true, dayStamp());
  });

  it('opens a group’s challenge from a notification', () => {
    stubServer();
    expect(openFromNotification({ kind: 'challenge', groupId: 'g1' })).toBe(true);
    expect(view()).toBe('groupChallenge');
  });
});

describe('a tapped request notification', () => {
  it("opens that group's requests and fetches the latest votes", async () => {
    const api = stubServer();
    api.fetchGroups.mockResolvedValue([family(), { ...family(), id: 'g2', name: 'Work' }]);
    useGroupsStore.setState({ groups: [family()], groupId: 'g1', selfId: 'me', selfName: 'Stewart' });
    expect(openFromNotification({ kind: 'stop-request', groupId: 'g2' })).toBe(true);
    expect(view()).toBe('groupRules');
    await store().sync();
    // Not on this phone until the sync, and still selected after it.
    expect(currentGroup(store())?.id).toBe('g2');
  });

  it('ignores anything that is not a group request', () => {
    for (const data of [null, 'x', {}, { kind: 'stop-request' }, { kind: 'other', groupId: 'g1' }]) {
      expect(openFromNotification(data)).toBe(false);
    }
    expect(view()).toBe('ov');
  });
});

describe('saved state', () => {
  const merge = (persisted: unknown) =>
    useGroupsStore.persist.getOptions().merge?.(persisted, store()) as ReturnType<typeof store>;

  it('keeps your identity and cached groups across restarts', () => {
    const g = family();
    const restored = merge(
      JSON.parse(JSON.stringify({ selfId: 'me', selfName: 'Me', groups: [g], groupId: 'g1', lastSynced: 5 }))
    );
    expect(restored.selfId).toBe('me');
    expect(restored.groups).toEqual([g]);
    expect(restored.lastSynced).toBe(5);
  });

  it('drops groups from the link-based design, which never reached the server', () => {
    const linkEra = { ...family(), inviteCode: undefined };
    expect(merge({ groups: [linkEra], groupId: 'g1' }).groups).toEqual([]);
  });
});
