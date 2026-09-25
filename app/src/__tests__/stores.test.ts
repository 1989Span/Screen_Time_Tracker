import { DEFAULT_PENALTY } from '../data';
import { setUsageSource } from '../usage/source';
import { emptySource } from '../usage/emptySource';
import { useDetailStore } from '../state/detailStore';
import { useGroupsStore } from '../state/groupsStore';
import { useNavStore } from '../state/navStore';
import { pendingSetting, usePenaltyStore } from '../state/penaltyStore';
import { useTimersStore } from '../state/timersStore';

const nav = () => useNavStore.getState();
const timers = () => useTimersStore.getState();
const detail = () => useDetailStore.getState();
const penalty = () => usePenaltyStore.getState();

// Stores are module singletons, so put each one back before the next test.
const initial = {
  nav: useNavStore.getState(),
  timers: useTimersStore.getState(),
  detail: useDetailStore.getState(),
  penalty: usePenaltyStore.getState(),
  groups: useGroupsStore.getState(),
};

beforeEach(() => {
  setUsageSource(emptySource);
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
