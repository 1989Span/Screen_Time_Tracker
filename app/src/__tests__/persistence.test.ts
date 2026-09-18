import { GROUPS, StoredGroup, isStoredGroup, reviveGroup } from '../groups';
import { promote } from '../state/penaltyStore';

/** What AsyncStorage actually does to a value on the way in and out. */
const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

describe('group persistence', () => {
  it('JSON drops Member.day, which is the bug revival exists to fix', () => {
    const before = GROUPS[0];
    expect(typeof before.members[0].day).toBe('function');

    const after = roundTrip(before) as StoredGroup;
    // Closures do not survive JSON. Rendering this would throw on mem.day(0).
    expect((after.members[0] as unknown as { day?: unknown }).day).toBeUndefined();
  });

  it('reviveGroup reattaches a working generator after a round trip', () => {
    const original = GROUPS[1];
    const revived = reviveGroup(roundTrip(original) as StoredGroup);

    expect(revived.members).toHaveLength(original.members.length);
    for (let i = 0; i < original.members.length; i++) {
      const a = original.members[i];
      const b = revived.members[i];
      expect(b.id).toBe(a.id);
      expect(typeof b.day).toBe('function');
      // Same inputs must reproduce the same usage, or points and streaks would
      // silently change every time the app restarted.
      expect(b.day(3)).toEqual(a.day(3));
      expect(b.day(0)).toEqual(a.day(0));
    }
  });

  it('revives your own row against your real usage, not a seeded profile', () => {
    const you = reviveGroup(roundTrip(GROUPS[0]) as StoredGroup).members.find((m) => m.id === 'you');
    expect(you).toBeDefined();
    expect(you!.day(2)).toEqual(GROUPS[0].members.find((m) => m.id === 'you')!.day(2));
  });

  describe('isStoredGroup rejects payloads that would crash on revive', () => {
    const valid = roundTrip(GROUPS[0]) as StoredGroup;

    it('accepts a well-formed stored group', () => {
      expect(isStoredGroup(valid)).toBe(true);
    });

    it.each([
      ['null', null],
      ['a string', 'nope'],
      ['no members', { ...valid, members: [] }],
      ['missing id', { ...valid, id: undefined }],
      ['created not a number', { ...valid, created: '86' }],
      ['member missing seed', { ...valid, members: [{ ...valid.members[0], seed: undefined }] }],
      ['member scale not an array', { ...valid, members: [{ ...valid.members[0], scale: 1.2 }] }],
    ])('rejects %s', (_label, payload) => {
      expect(isStoredGroup(payload)).toBe(false);
    });
  });
});

describe('penalty "starts tomorrow" promotion', () => {
  const setting = { limit: 240, rate: 0.1 };
  const tighter = { limit: 120, rate: 0.25 };

  it('does nothing on the same day', () => {
    expect(promote({ current: setting, next: tighter, appliedOn: '2026-09-17' }, '2026-09-17')).toBeNull();
  });

  it('applies a pending change once the day moves on', () => {
    expect(promote({ current: setting, next: tighter, appliedOn: '2026-09-17' }, '2026-09-18')).toEqual({
      current: tighter,
      next: undefined,
      appliedOn: '2026-09-18',
    });
  });

  it('keeps the current setting when nothing was pending', () => {
    expect(promote({ current: setting, next: undefined, appliedOn: '2026-09-17' }, '2026-09-18')).toEqual({
      current: setting,
      next: undefined,
      appliedOn: '2026-09-18',
    });
  });

  it('turns the limit off when the pending change was a removal', () => {
    expect(promote({ current: setting, next: null, appliedOn: '2026-09-17' }, '2026-09-18')).toEqual({
      current: null,
      next: undefined,
      appliedOn: '2026-09-18',
    });
  });

  it('applies once, not repeatedly, when several days passed', () => {
    const first = promote({ current: setting, next: tighter, appliedOn: '2026-09-01' }, '2026-09-18');
    expect(first).toEqual({ current: tighter, next: undefined, appliedOn: '2026-09-18' });
    // Running again the same day must be a no-op, so it is safe to call from
    // both rehydrate and the day-rollover hook.
    expect(promote(first!, '2026-09-18')).toBeNull();
  });
});
