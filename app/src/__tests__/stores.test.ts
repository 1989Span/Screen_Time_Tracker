import { DEFAULT_PENALTY } from '../data';
import { setUsageSource } from '../usage/source';
import { emptySource } from '../usage/emptySource';
import { useDetailStore } from '../state/detailStore';
import { useGroupsStore } from '../state/groupsStore';
import { useNavStore } from '../state/navStore';
import { setFixedClock } from '../clock';
import { usePenaltyStore } from '../state/penaltyStore';
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
  // Nothing ships switched on. Plans are set per test.
  const SETTING = { limit: 240, rate: 0.1 };

  afterEach(() => setFixedClock(new Date(2026, 7, 25, 19, 0, 0)));

  it('seeds the editor from this month’s setting', () => {
    usePenaltyStore.setState({ plans: { '2026-08': { setting: SETTING, from: '2026-08-03', confirmed: true } } });
    penalty().openEditor();
    expect(penalty().draft).toEqual(SETTING);
    // 4h is a preset button, so the custom hour/minute fields stay empty...
    expect(penalty().limitH).toBe('');
    expect(penalty().limitM).toBe('');
    // ...but 10c a minute is not a preset, so it shows in the custom rate field.
    expect(penalty().rateText).toBe('0.10');
  });

  it('fills the custom fields when the limit is not a preset', () => {
    usePenaltyStore.setState({
      plans: { '2026-08': { setting: { limit: 90, rate: 1 }, from: '2026-08-03', confirmed: true } },
    });
    penalty().openEditor();
    expect(penalty().limitH).toBe('1');
    expect(penalty().limitM).toBe('30');
    expect(penalty().rateText).toBe(''); // $1 is a preset
  });

  it('offers the editor default when nothing is set', () => {
    usePenaltyStore.setState({ plans: {} });
    penalty().openEditor();
    expect(penalty().draft).toEqual(DEFAULT_PENALTY);
  });

  it('takes two steps to lock in a limit', () => {
    usePenaltyStore.setState({ plans: {} });
    penalty().openEditor();
    penalty().setLimitPreset(360);
    penalty().setRatePreset(1);
    penalty().review(penalty().draft);
    // The first step only shows what would be locked.
    expect(penalty().plans).toEqual({});
    expect(penalty().pending).toEqual({ limit: 360, rate: 1 });
    penalty().confirmReview();
    expect(penalty().plans['2026-08']).toEqual({
      setting: { limit: 360, rate: 1 },
      from: '2026-08-25',
      confirmed: true,
    });
    expect(penalty().pending).toBeUndefined();
  });

  it('going back from the confirmation step saves nothing', () => {
    usePenaltyStore.setState({ plans: {} });
    penalty().review({ limit: 360, rate: 1 });
    penalty().cancelReview();
    expect(penalty().plans).toEqual({});
  });

  it('a locked month ignores a confirmed change', () => {
    const plans = { '2026-08': { setting: SETTING, from: '2026-08-03', confirmed: true } };
    usePenaltyStore.setState({ plans });
    penalty().review({ limit: 600, rate: 0.25 });
    penalty().confirmReview();
    expect(penalty().plans).toEqual(plans);
  });

  it('in the first days of a carried-over month, a change covers the whole month', () => {
    setFixedClock(new Date(2026, 8, 2, 12, 0, 0)); // 2 Sep
    usePenaltyStore.setState({ plans: { '2026-08': { setting: SETTING, from: '2026-08-03', confirmed: true } } });
    penalty().review({ limit: 600, rate: 0.25 });
    penalty().confirmReview();
    expect(penalty().plans['2026-09']).toEqual({
      setting: { limit: 600, rate: 0.25 },
      from: '2026-09-01',
      confirmed: true,
    });
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

  it('drops anything saved that isn’t a valid plan', () => {
    const merge = usePenaltyStore.persist.getOptions().merge as (p: unknown, c: unknown) => { plans: object };
    const restored = merge(
      {
        plans: {
          '2026-08': { setting: SETTING, from: '2026-08-03', confirmed: true },
          '2026-09': { setting: { limit: 99999, rate: 1 }, from: '2026-09-01', confirmed: true },
          junk: { setting: null, from: '2026-10-01', confirmed: true },
        },
      },
      penalty()
    );
    expect(Object.keys(restored.plans)).toEqual(['2026-08']);
  });
});
