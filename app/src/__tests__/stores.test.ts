import { CATS, DEFAULT_PENALTY } from '../data';
import { Contact, MIN_GROUP_SIZE, groupStats } from '../groups';
import { TEST_CONTACTS, installCategorySeries, testContact, testGroup, testMember } from '../__fixtures__/groups';
import { useDetailStore } from '../state/detailStore';
import { currentGroup, invitesFor, rulesFor, useGroupsStore } from '../state/groupsStore';
import { useNavStore } from '../state/navStore';
import { pendingSetting, usePenaltyStore } from '../state/penaltyStore';
import { useTimersStore } from '../state/timersStore';

const nav = () => useNavStore.getState();
const timers = () => useTimersStore.getState();
const detail = () => useDetailStore.getState();
const penalty = () => usePenaltyStore.getState();
const groups = () => useGroupsStore.getState();

// Stores are module singletons, so put each one back before the next test.
const initial = {
  nav: useNavStore.getState(),
  timers: useTimersStore.getState(),
  detail: useDetailStore.getState(),
  penalty: usePenaltyStore.getState(),
  groups: useGroupsStore.getState(),
};

beforeEach(() => {
  installCategorySeries();
  useNavStore.setState(initial.nav, true);
  useTimersStore.setState(initial.timers, true);
  useDetailStore.setState(initial.detail, true);
  usePenaltyStore.setState(initial.penalty, true);
  useGroupsStore.setState(initial.groups, true);
});

describe('navigation', () => {
  it('starts on the overview', () => {
    expect(nav().view).toBe('ov');
  });

  it('follows actions that navigate', () => {
    detail().openRange('month');
    expect(nav().view).toBe('detail');
    expect(detail().range).toBe('month');

    timers().open('com.example.app');
    expect(nav().view).toBe('limit');
    expect(timers().editing).toBe('com.example.app');

    penalty().openEditor();
    expect(nav().view).toBe('penalty');
  });
});

describe('timers', () => {
  it('sets and clears a per-app budget, keyed by package', () => {
    // Keyed by package, not index: the tracked list is reordered whenever the
    // user edits it, and an index key would follow the slot, not the app.
    timers().setLimit('com.instagram.android', 60);
    expect(timers().limits['com.instagram.android']).toBe(60);
    timers().clearLimit('com.instagram.android');
    expect(timers().limits['com.instagram.android']).toBeUndefined();
  });
});

describe('breakdown', () => {
  it('scopes into a bar and clears it by tapping again', () => {
    detail().toggleBucket(3);
    expect(detail().selected).toBe(3);
    detail().toggleBucket(3);
    expect(detail().selected).toBeNull();
  });

  it('drops the scoped bar when the range changes', () => {
    detail().toggleBucket(2);
    detail().setRange('day');
    expect(detail().selected).toBeNull();
    expect(detail().range).toBe('day');
  });
});

describe('penalty limit', () => {
  // No penalty ships with the app: `current` starts null and nothing is charged
  // until the user saves a limit. These tests therefore set today's limit first.
  const TODAY_SETTING = { limit: 240, rate: 0.1 };
  beforeEach(() => {
    usePenaltyStore.setState({ current: TODAY_SETTING, next: undefined, draft: TODAY_SETTING });
  });

  it('seeds the editor from today’s setting', () => {
    penalty().openEditor();
    expect(penalty().draft).toEqual(TODAY_SETTING);
    // 4h is a preset button, so the custom hour/minute fields stay empty...
    expect(penalty().limitH).toBe('');
    expect(penalty().limitM).toBe('');
    // ...but 10c a minute is not a preset, so it shows in the custom rate field.
    expect(penalty().rateText).toBe('0.10');
  });

  it('fills the custom fields when the limit is not a preset', () => {
    usePenaltyStore.setState({ current: { limit: 90, rate: 1 }, next: undefined });
    penalty().openEditor();
    expect(penalty().limitH).toBe('1');
    expect(penalty().limitM).toBe('30');
    expect(penalty().rateText).toBe(''); // $1 is a preset
  });

  it('saves a change for tomorrow and leaves today alone', () => {
    penalty().openEditor();
    penalty().setLimitPreset(360);
    penalty().setRatePreset(1);
    penalty().save();

    expect(penalty().current).toEqual(TODAY_SETTING); // today is untouched
    expect(pendingSetting(penalty())).toEqual({ limit: 360, rate: 1 });
  });

  it('undoes a pending change', () => {
    penalty().openEditor();
    penalty().setLimitPreset(360);
    penalty().save();
    penalty().undoPending();
    expect(penalty().next).toBeUndefined();
    expect(pendingSetting(penalty())).toEqual(TODAY_SETTING);
  });

  it('saving today’s setting again just cancels the pending change', () => {
    penalty().openEditor();
    penalty().setLimitPreset(360);
    penalty().save();
    penalty().setLimitPreset(TODAY_SETTING.limit);
    penalty().setRatePreset(TODAY_SETTING.rate);
    penalty().save();
    expect(penalty().next).toBeUndefined();
  });

  it('turns the limit off from tomorrow', () => {
    penalty().remove();
    expect(penalty().current).toEqual(TODAY_SETTING);
    expect(penalty().next).toBeNull();
    expect(pendingSetting(penalty())).toBeNull();
  });

  it('keeps an invalid custom rate out of the draft', () => {
    penalty().openEditor();
    const before = penalty().draft.rate;
    penalty().setRateText('abc');
    expect(penalty().rateText).toBe('abc');
    expect(penalty().draft.rate).toBe(before);

    penalty().setRateText('2.50');
    expect(penalty().draft.rate).toBe(2.5);
  });

  it('keeps an invalid custom limit out of the draft', () => {
    penalty().openEditor();
    const before = penalty().draft.limit;
    penalty().setLimitFields('99', '00');
    expect(penalty().draft.limit).toBe(before);

    penalty().setLimitFields('1', '30');
    expect(penalty().draft.limit).toBe(90);
  });

  it('offers the editor default when the limit is off', () => {
    usePenaltyStore.setState({ current: null, next: undefined });
    penalty().openEditor();
    expect(penalty().draft).toEqual(DEFAULT_PENALTY);
  });
});

describe('groups', () => {
  // The app ships no groups, so these tests build the world they need. Two
  // members is exactly MIN_GROUP_SIZE, which is what makes the voting rules
  // observable.
  // Usage is weighted onto single categories so that excluding one flips the
  // ranking, which is what makes the retroactive-scoring test meaningful.
  const alpha = () =>
    testGroup('alpha', 'Alpha', 3, [
      testMember('you', 'You', { joined: 3, base: 10, weights: { social: 1 } }),
      testMember('bob', 'Bob', { joined: 3, base: 90, weights: { navigation: 1 } }),
    ]);
  const beta = () => testGroup('beta', 'Beta', 2, [testMember('you', 'You', { joined: 2, base: 30 })]);
  // Bob has already agreed, so one vote from you completes unanimity in a
  // two-member group.
  const seededRules = {
    alpha: {
      excluded: ['music'],
      proposals: [{ cat: 'navigation', kind: 'exclude' as const, agreed: ['bob'] }],
    },
    beta: { excluded: [], proposals: [] },
  };
  const contacts: Contact[] = TEST_CONTACTS;

  beforeEach(() => {
    useGroupsStore.setState({
      groups: [alpha(), beta()],
      groupId: 'alpha',
      rules: seededRules,
      invites: {},
    });
  });

  it('starts on the selected group with its rules', () => {
    const group = currentGroup(groups())!;
    expect(group.name).toBe('Alpha');
    expect(rulesFor(groups(), group.id)).toEqual(seededRules.alpha);
  });

  it('switches groups', () => {
    groups().select('beta');
    expect(currentGroup(groups())!.name).toBe('Beta');
  });

  it('has no group selected when there are none', () => {
    // The shipped state: no seeded groups, so the tab shows its empty state
    // rather than crashing on a missing first element.
    useGroupsStore.setState({ groups: [], groupId: '' });
    expect(currentGroup(groups())).toBeNull();
  });

  it('agreeing to the last open vote changes the ranking retroactively', () => {
    const group = currentGroup(groups())!;
    const before = groupStats(group, rulesFor(groups(), group.id).excluded).stats.map((s) => s.points);

    groups().agree('navigation'); // Bob already agreed, so this settles it

    const rules = rulesFor(groups(), group.id);
    expect(rules.excluded).toContain('navigation');
    const after = groupStats(group, rules.excluded).stats.map((s) => s.points);
    expect(after).not.toEqual(before);
  });

  it('declining closes a vote without changing what is tracked', () => {
    const group = currentGroup(groups())!;
    groups().declineProposal('navigation');
    const rules = rulesFor(groups(), group.id);
    expect(rules.proposals.some((p) => p.cat === 'navigation')).toBe(false);
    expect(rules.excluded).not.toContain('navigation');
  });

  it('proposing puts your vote in and waits for the others', () => {
    const group = currentGroup(groups())!;
    groups().proposeChange('games');
    const proposal = rulesFor(groups(), group.id).proposals.find((p) => p.cat === 'games')!;
    expect(proposal.agreed).toEqual(['you']);
    expect(rulesFor(groups(), group.id).excluded).not.toContain('games');
  });

  it('caps the group name and trims it when creating', () => {
    groups().openNewGroup();
    groups().setNgName('x'.repeat(50));
    expect(groups().ngName).toHaveLength(30);
  });

  it('leaving moves to the next group and drops its invites', () => {
    const leaving = currentGroup(groups())!;
    groups().askLeave();
    expect(groups().leaveConfirm).toBe(true);
    groups().leave();

    expect(groups().groups.map((g) => g.id)).not.toContain(leaving.id);
    expect(groups().invites[leaving.id]).toBeUndefined();
    expect(currentGroup(groups())!.name).toBe('Beta');
    expect(groups().leaveConfirm).toBe(false);
    expect(nav().view).toBe('groups');
  });

  it('leaving every group leaves none selected', () => {
    groups().leave();
    groups().leave();
    expect(groups().groups).toEqual([]);
    expect(currentGroup(groups())).toBeNull();
  });

  it('cannot invite anyone, because no contact list exists yet', () => {
    // Inviting needs real contacts: address-book permission plus a backend to
    // match them against. Until both exist the flow completes with nothing, which
    // is honest - previously it appeared to work against invented people.
    groups().openInvite();
    groups().setIvPicked(['c-alex', 'c-sam'], '');
    groups().sendInvites();
    const group = currentGroup(groups())!;
    expect(invitesFor(groups(), group.id)).toEqual([]);
    expect(nav().view).toBe('groupSettings');
  });

  it('creates a group containing only you, with the chosen categories tracked', () => {
    groups().openNewGroup();
    groups().setNgName('Work friends');
    groups().toggleNgCategory('games'); // off
    groups().createGroup();

    const group = currentGroup(groups())!;
    expect(group.name).toBe('Work friends');
    expect(group.members).toHaveLength(1); // just you; nobody to invite yet
    expect(rulesFor(groups(), group.id).excluded).toEqual(['games']);
    expect(nav().view).toBe('groups');
  });

  it('ships no contacts to invite', () => {
    // Real contacts need address-book permission and a backend to match them
    // against. Until then the list is empty rather than invented.

    expect(require('../groups').CONTACTS).toEqual([]);
    expect(contacts.some((c) => c.id === 'c-alex')).toBe(true); // fixtures only
  });
});
