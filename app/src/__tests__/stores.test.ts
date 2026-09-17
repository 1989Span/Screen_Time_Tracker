import { CATS, DEFAULT_PENALTY, DEMO_PENALTY } from '../data';
import { CONTACTS, GROUPS, INITIAL_RULES, MIN_GROUP_SIZE, groupStats } from '../groups';
import { useDetailStore } from '../state/detailStore';
import { currentGroup, invitesFor, rulesFor, useGroupsStore } from '../state/groupsStore';
import { useNavStore } from '../state/navStore';
import { pendingSetting, usePenaltyStore } from '../state/penaltyStore';
import { usePrefsStore } from '../state/prefsStore';
import { useTimersStore } from '../state/timersStore';

const nav = () => useNavStore.getState();
const prefs = () => usePrefsStore.getState();
const timers = () => useTimersStore.getState();
const detail = () => useDetailStore.getState();
const penalty = () => usePenaltyStore.getState();
const groups = () => useGroupsStore.getState();

// Stores are module singletons, so put each one back before the next test.
const initial = {
  nav: useNavStore.getState(),
  prefs: usePrefsStore.getState(),
  timers: useTimersStore.getState(),
  detail: useDetailStore.getState(),
  penalty: usePenaltyStore.getState(),
  groups: useGroupsStore.getState(),
};

beforeEach(() => {
  useNavStore.setState(initial.nav, true);
  usePrefsStore.setState(initial.prefs, true);
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

    timers().open(2);
    expect(nav().view).toBe('limit');
    expect(timers().editing).toBe(2);

    penalty().openEditor();
    expect(nav().view).toBe('penalty');
  });
});

describe('tracked categories', () => {
  it('starts with everything tracked and toggles one at a time', () => {
    expect(prefs().tracked).toHaveLength(CATS.length);
    prefs().toggle('social');
    expect(prefs().tracked).not.toContain('social');
    prefs().toggle('social');
    expect(prefs().tracked).toContain('social');
  });

  it('clears all, then selects all', () => {
    prefs().toggleAll();
    expect(prefs().tracked).toEqual([]);
    prefs().toggleAll();
    expect(prefs().tracked).toHaveLength(CATS.length);
  });
});

describe('timers', () => {
  it('sets and clears a category budget', () => {
    timers().setLimit(0, 60);
    expect(timers().limits[CATS[0].id]).toBe(60);
    timers().clearLimit(0);
    expect(timers().limits[CATS[0].id]).toBeUndefined();
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
  it('seeds the editor from today’s setting', () => {
    penalty().openEditor();
    expect(penalty().draft).toEqual(DEMO_PENALTY);
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

    expect(penalty().current).toEqual(DEMO_PENALTY); // today is untouched
    expect(pendingSetting(penalty())).toEqual({ limit: 360, rate: 1 });
  });

  it('undoes a pending change', () => {
    penalty().openEditor();
    penalty().setLimitPreset(360);
    penalty().save();
    penalty().undoPending();
    expect(penalty().next).toBeUndefined();
    expect(pendingSetting(penalty())).toEqual(DEMO_PENALTY);
  });

  it('saving today’s setting again just cancels the pending change', () => {
    penalty().openEditor();
    penalty().setLimitPreset(360);
    penalty().save();
    penalty().setLimitPreset(DEMO_PENALTY.limit);
    penalty().setRatePreset(DEMO_PENALTY.rate);
    penalty().save();
    expect(penalty().next).toBeUndefined();
  });

  it('turns the limit off from tomorrow', () => {
    penalty().remove();
    expect(penalty().current).toEqual(DEMO_PENALTY);
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

  it('offers the default setting when the limit is off', () => {
    usePenaltyStore.setState({ current: null, next: undefined });
    penalty().openEditor();
    expect(penalty().draft).toEqual(DEFAULT_PENALTY);
  });
});

describe('groups', () => {
  it('starts on the Friends group with its seeded rules', () => {
    const group = currentGroup(groups())!;
    expect(group.name).toBe('Friends');
    expect(rulesFor(groups(), group.id)).toEqual(INITIAL_RULES.friends);
  });

  it('switches groups', () => {
    groups().select(GROUPS[1].id);
    expect(currentGroup(groups())!.name).toBe('Family');
  });

  it('agreeing to the last open vote changes the ranking retroactively', () => {
    const group = currentGroup(groups())!;
    const before = groupStats(group, rulesFor(groups(), group.id).excluded).stats.map((s) => s.points);

    groups().agree('navigation'); // Maya, Jordan and Priya already agreed

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

  it('creates a group from the draft, with only the chosen categories tracked', () => {
    groups().openNewGroup();
    expect(nav().view).toBe('newGroup');
    groups().setNgName('Work friends');
    groups().toggleNgCategory('games');
    groups().setNgPicked(['c-alex'], '');
    groups().createGroup();

    const group = currentGroup(groups())!;
    expect(group.name).toBe('Work friends');
    expect(group.members).toHaveLength(1); // just you until someone accepts
    expect(rulesFor(groups(), group.id).excluded).toEqual(['games']);
    expect(invitesFor(groups(), group.id)).toEqual([{ contactId: 'c-alex', via: 'app' }]);
    expect(nav().view).toBe('groups');
  });

  it('caps the group name and trims it when creating', () => {
    groups().openNewGroup();
    groups().setNgName('x'.repeat(50));
    expect(groups().ngName).toHaveLength(30);
  });

  it('sends invites and returns to settings', () => {
    groups().openInvite();
    groups().setIvPicked(['c-alex', 'c-sam'], '');
    groups().sendInvites();

    const group = currentGroup(groups())!;
    expect(invitesFor(groups(), group.id)).toEqual([
      { contactId: 'c-alex', via: 'app' },
      { contactId: 'c-sam', via: 'link' }, // Sam has no app, so a download link
    ]);
    expect(groups().ivInvited).toEqual([]);
    expect(nav().view).toBe('groupSettings');
  });

  it('accepting an invite adds the member and clears the invite', () => {
    groups().openInvite();
    groups().setIvPicked(['c-alex'], '');
    groups().sendInvites();
    const before = currentGroup(groups())!.members.length;

    groups().acceptInvite('c-alex');

    const group = currentGroup(groups())!;
    expect(group.members).toHaveLength(before + 1);
    expect(group.members[group.members.length - 1].joined).toBe(0);
    expect(invitesFor(groups(), group.id)).toEqual([]);
  });

  it('will not cancel the last invite of a one-person group', () => {
    groups().openNewGroup();
    groups().setNgName('Solo');
    groups().setNgPicked(['c-sam'], '');
    groups().createGroup();
    const group = currentGroup(groups())!;
    expect(group.members.length + invitesFor(groups(), group.id).length).toBe(MIN_GROUP_SIZE);

    groups().cancelInvite('c-sam');
    expect(invitesFor(groups(), group.id)).toHaveLength(1); // refused
  });

  it('cancels an invite when the group stays big enough', () => {
    groups().openInvite();
    groups().setIvPicked(['c-alex'], '');
    groups().sendInvites();
    groups().cancelInvite('c-alex');
    expect(invitesFor(groups(), currentGroup(groups())!.id)).toEqual([]);
  });

  it('leaving moves to the next group and drops its invites', () => {
    const leaving = currentGroup(groups())!;
    groups().askLeave();
    expect(groups().leaveConfirm).toBe(true);
    groups().leave();

    expect(groups().groups.map((g) => g.id)).not.toContain(leaving.id);
    expect(groups().invites[leaving.id]).toBeUndefined();
    expect(currentGroup(groups())!.name).toBe('Family');
    expect(groups().leaveConfirm).toBe(false);
    expect(nav().view).toBe('groups');
  });

  it('leaving every group leaves none selected', () => {
    groups().leave();
    groups().leave();
    expect(groups().groups).toEqual([]);
    expect(currentGroup(groups())).toBeNull();
  });

  it('knows the demo contacts it can invite', () => {
    expect(CONTACTS.some((c) => c.id === 'c-alex')).toBe(true);
  });
});
