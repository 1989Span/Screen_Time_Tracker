import { Share } from 'react-native';

import { dayStamp } from '../clock';
import { groupLink, readGroupLink } from '../groupLink';
import { Group, Member, agreeToExclude, makeGroup, newMember, shiftStamp } from '../groups';
import { currentGroup, useGroupsStore } from '../state/groupsStore';
import { useNavStore } from '../state/navStore';
import { emptySource } from '../usage/emptySource';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';

const store = () => useGroupsStore.getState();
const view = () => useNavStore.getState().view;
const initial = useGroupsStore.getState();

const today = dayStamp();
const created = shiftStamp(today, -3);

/** Alex's phone: a group Alex created, with Alex's numbers, shared as a link. */
function alexLink(sharedAt: number, days: Record<string, number>, extra: Member[] = []): string {
  const alex: Member = { ...newMember('alex0001', 'Alex Kim', created), sharedAt, days };
  const g: Group = { id: 'fam00001', name: 'Family', created, members: [alex, ...extra] };
  return groupLink(g, alex);
}

/** A source whose every day has the same per-app minutes, for the share tests. */
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

beforeEach(() => {
  useGroupsStore.setState({ ...initial, selfId: 'me000001', selfName: '', groups: [], groupId: '' }, true);
  useNavStore.setState({ view: 'ov' });
  setUsageSource(emptySource);
  jest.restoreAllMocks();
});

describe('receiving an invite', () => {
  it('asks before joining a group you are not in', () => {
    expect(store().receive(alexLink(Date.now() - 1000, { [shiftStamp(today, -1)]: 100 }))).toBe(true);
    expect(store().incoming?.name).toBe('Family');
    expect(view()).toBe('groupJoin');
    expect(store().groups).toEqual([]);
  });

  it('needs your name, then adds you and everyone the link carried', () => {
    store().receive(alexLink(Date.now() - 1000, { [shiftStamp(today, -1)]: 100 }));
    store().joinIncoming();
    expect(store().groups).toEqual([]); // no name yet

    store().setSelfName('Stewart');
    store().joinIncoming();
    const g = currentGroup(store()) as Group;
    expect(g.members.map((m) => m.id).sort()).toEqual(['alex0001', 'me000001']);
    expect(g.members.find((m) => m.id === 'me000001')?.joined).toBe(today);
    expect(g.members.find((m) => m.id === 'alex0001')?.days).toEqual({ [shiftStamp(today, -1)]: 100 });
    expect(store().incoming).toBeNull();
    expect(store().notice).toContain('Alex');
    expect(view()).toBe('groups');
  });

  it('declining leaves nothing behind', () => {
    store().receive(alexLink(Date.now() - 1000, {}));
    store().dismissIncoming();
    expect(store().incoming).toBeNull();
    expect(store().groups).toEqual([]);
  });
});

describe('later links from the same group', () => {
  // One timestamp for the first link, so resending that exact share really is nothing new.
  const firstShare = Date.now() - 60_000;

  beforeEach(() => {
    store().setSelfName('Stewart');
    store().receive(alexLink(firstShare, { [shiftStamp(today, -1)]: 100 }));
    store().joinIncoming();
  });

  it('update the group in place instead of asking again', () => {
    expect(store().receive(alexLink(Date.now() - 1000, { [today]: 42 }))).toBe(true);
    const alex = currentGroup(store())?.members.find((m) => m.id === 'alex0001');
    expect(alex?.days).toEqual({ [shiftStamp(today, -1)]: 100, [today]: 42 });
    expect(store().incoming).toBeNull();
    expect(store().notice).toBe('Updated Alex in "Family".');
    expect(view()).toBe('groups');
  });

  it('say so when there is nothing new', () => {
    store().receive(alexLink(firstShare, { [shiftStamp(today, -1)]: 100 }));
    expect(store().notice).toBe('"Family" is already up to date.');
  });

  it('bring in members you had not met yet', () => {
    const sam: Member = { ...newMember('sam00001', 'Sam', today), sharedAt: Date.now() - 5000 };
    store().receive(alexLink(Date.now() - 1000, {}, [sam]));
    expect(
      currentGroup(store())
        ?.members.map((m) => m.name)
        .sort()
    ).toEqual(['Alex Kim', 'Sam', 'Stewart']);
  });
});

describe('pasting a link', () => {
  it('rejects anything that is not a group link, and says so', () => {
    store().setLinkDraft('hello there');
    store().openLinkDraft();
    expect(store().linkError).toMatch(/isn't a Gauge group link/);
    expect(store().receive('https://example.com')).toBe(false);
  });

  it('accepts a whole pasted message', () => {
    store().setLinkDraft('Join us!\n' + alexLink(Date.now() - 1000, {}) + '\nbye');
    store().openLinkDraft();
    expect(store().linkError).toBeNull();
    expect(store().incoming?.id).toBe('fam00001');
  });
});

describe('creating and sharing', () => {
  it('needs a group name and your name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    store().setNgName('Work');
    await store().createGroup();
    expect(store().groups).toEqual([]);
    expect(share).not.toHaveBeenCalled();
  });

  it('starts a group with only you and opens the invite', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    store().setSelfName('Stewart');
    store().setNgName('Work');
    await store().createGroup();

    const g = currentGroup(store()) as Group;
    expect(g.name).toBe('Work');
    expect(g.members.map((m) => m.id)).toEqual(['me000001']);
    expect(share).toHaveBeenCalledTimes(1);
    const message = (share.mock.calls[0][0] as { message: string }).message;
    expect(message).toMatch(/^Join my group "Work"/);
    expect(readGroupLink(message)?.id).toBe(g.id);
  });

  it('shares every app except the ones the group left out', async () => {
    setUsageSource(new SameEveryDay({ 'com.a': 30, 'com.music': 20 }));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    store().setSelfName('Stewart');
    store().receive(alexLink(Date.now() - 1000, {}));
    store().joinIncoming();
    // Both members agree to leave music out.
    useGroupsStore.setState((s) => ({
      groups: s.groups.map((g) =>
        agreeToExclude(agreeToExclude(g, 'me000001', 'com.music', 'Music'), 'alex0001', 'com.music', 'Music')
      ),
    }));

    await store().share('update');
    const got = readGroupLink((share.mock.calls[0][0] as { message: string }).message);
    const me = got?.members.find((m) => m.id === 'me000001');
    // Joined today, so only today is shared: 30, not 50.
    expect(me?.days).toEqual({ [today]: 30 });
    expect(me?.name).toBe('Stewart');
    expect(currentGroup(store())?.members.find((m) => m.id === 'me000001')?.sharedAt).toBeGreaterThan(0);
  });
});

describe('votes and leaving', () => {
  beforeEach(() => {
    store().setSelfName('Stewart');
    store().receive(alexLink(Date.now() - 1000, {}));
    store().joinIncoming();
  });

  it('a vote changes only your own entry', () => {
    store().proposeExclude('com.maps', 'Maps');
    const g = currentGroup(store()) as Group;
    expect(g.members.find((m) => m.id === 'me000001')?.excludes).toEqual({ 'com.maps': 'Maps' });
    expect(g.members.find((m) => m.id === 'alex0001')?.excludes).toEqual({});
  });

  it('leaving removes the group from this phone, and its notice', () => {
    store().leave();
    expect(store().groups).toEqual([]);
    expect(store().notice).toBeNull();
    expect(view()).toBe('groups');
  });

  it('renaming yourself updates your name in every group', () => {
    store().setSelfName('Stu');
    expect(currentGroup(store())?.members.find((m) => m.id === 'me000001')?.name).toBe('Stu');
  });
});

describe('saved state', () => {
  const merge = (persisted: unknown) =>
    useGroupsStore.persist.getOptions().merge?.(persisted, store()) as ReturnType<typeof store>;

  it('keeps your group identity and groups across restarts', () => {
    const g = makeGroup('grp00001', 'Family', created, newMember('me000009', 'Me', created));
    const restored = merge(
      JSON.parse(JSON.stringify({ selfId: 'me000009', selfName: 'Me', groups: [g], groupId: g.id }))
    );
    expect(restored.selfId).toBe('me000009');
    expect(restored.groups).toEqual([g]);
    expect(restored.groupId).toBe('grp00001');
  });

  it('drops groups saved by the old contact-based design instead of half-loading them', () => {
    const old = {
      id: 'g-1',
      name: 'Old',
      created: 3,
      members: [{ id: 'you', name: 'You', joined: 3, seed: 0, scale: [] }],
    };
    const restored = merge({ groups: [old], groupId: 'g-1' });
    expect(restored.groups).toEqual([]);
    expect(restored.groupId).toBe('');
  });
});
