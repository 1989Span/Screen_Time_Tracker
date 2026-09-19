import { StoredGroup, isStoredGroup, reviveGroup } from '../groups';
import { testGroup, testMember } from '../__fixtures__/groups';
import { promote } from '../state/penaltyStore';
import { dayUsageAt } from '../data';

/** What AsyncStorage actually does to a value on the way in and out. */
const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));

// The app ships no seeded groups any more, so the fixture is built here.
const sample = () =>
  testGroup('friends', 'Friends', 30, [
    testMember('you', 'You', { joined: 30, base: 60 }),
    testMember('maya', 'Maya', { joined: 30, base: 40 }),
  ]);

describe('group persistence', () => {
  it('JSON drops Member.day, which is the bug revival exists to fix', () => {
    const before = sample();
    expect(typeof before.members[0].day).toBe('function');

    const after = roundTrip(before) as StoredGroup;
    // Closures do not survive JSON. Rendering this would throw on mem.day(0).
    expect((after.members[0] as unknown as { day?: unknown }).day).toBeUndefined();
  });

  it('reviveGroup reattaches a callable day function and preserves identity', () => {
    const original = sample();
    const revived = reviveGroup(roundTrip(original) as StoredGroup);

    expect(revived.members).toHaveLength(original.members.length);
    for (let i = 0; i < original.members.length; i++) {
      const a = original.members[i];
      const b = revived.members[i];
      expect(b.id).toBe(a.id);
      expect(b.name).toBe(a.name);
      expect(b.joined).toBe(a.joined);
      // The whole point: without this the next render throws on mem.day(0).
      expect(typeof b.day).toBe('function');
      expect(() => b.day(0)).not.toThrow();
      expect(() => b.day(3)).not.toThrow();
    }
  });

  it('revives your own row against real device usage', () => {
    const you = reviveGroup(roundTrip(sample()) as StoredGroup).members.find((m) => m.id === 'you');
    expect(you).toBeDefined();
    // Reads whatever the installed source reports, rather than a stored profile,
    // so your standing reflects the device and not a snapshot.
    expect(you!.day(2)).toEqual(dayUsageAt(2));
  });

  it('revives everyone else as zero rather than inventing a profile', () => {
    const other = reviveGroup(roundTrip(sample()) as StoredGroup).members.find((m) => m.id !== 'you');
    expect(other).toBeDefined();
    // The OS only reports this device. Another person's usage needs a backend, and
    // until there is one, zero is the only honest answer.
    expect(other!.day(2).every((v) => v === 0)).toBe(true);
  });

  describe('isStoredGroup rejects payloads that would crash on revive', () => {
    const valid = roundTrip(sample()) as StoredGroup;

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
