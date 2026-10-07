import {
  Group,
  Member,
  agreeToExclude,
  declineExclude,
  GRACE_DAYS,
  excludedApps,
  groupMinutes,
  newMember,
  openProposals,
  selfDays,
  shiftStamp,
  standings,
  withdrawExclude,
} from '../groups';

const member = (id: string, joined: string, over: Partial<Member> = {}): Member => ({
  ...newMember(id, id.toUpperCase(), joined),
  ...over,
});

const group = (members: Member[], created = '2026-09-20'): Group => ({ id: 'grp000', name: 'G', created, members });

/** Reads each member's numbers from their `days`, which is how others are stored. */
const shared = (m: Member, day: string) => m.days[day];

describe('day stamps', () => {
  it('steps across month ends and daylight-saving changes', () => {
    expect(shiftStamp('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftStamp('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftStamp('2026-11-01', 1)).toBe('2026-11-02');
    expect(shiftStamp('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('leaving apps out', () => {
  const two = () => group([member('me0000', '2026-09-20'), member('alex00', '2026-09-20')]);

  it('needs every member to agree', () => {
    let g = agreeToExclude(two(), 'me0000', 'com.spotify', 'Spotify');
    expect(excludedApps(g)).toEqual([]);
    expect(openProposals(g)).toEqual([{ app: 'com.spotify', label: 'Spotify', agreed: ['me0000'], declined: [] }]);
    g = agreeToExclude(g, 'alex00', 'com.spotify', 'Spotify');
    expect(excludedApps(g)).toEqual(['com.spotify']);
    expect(openProposals(g)).toEqual([]);
  });

  it('cannot be decided by one person alone', () => {
    const solo = agreeToExclude(group([member('me0000', '2026-09-20')]), 'me0000', 'com.a', 'A');
    expect(excludedApps(solo)).toEqual([]);
  });

  it('comes back as soon as any member withdraws', () => {
    let g = agreeToExclude(agreeToExclude(two(), 'me0000', 'com.a', 'A'), 'alex00', 'com.a', 'A');
    g = withdrawExclude(g, 'alex00', 'com.a');
    expect(excludedApps(g)).toEqual([]);
    expect(openProposals(g)[0].agreed).toEqual(['me0000']);
  });

  it('shows who declined, and agreeing later clears the decline', () => {
    let g = declineExclude(agreeToExclude(two(), 'me0000', 'com.a', 'A'), 'alex00', 'com.a');
    expect(openProposals(g)[0].declined).toEqual(['alex00']);
    g = agreeToExclude(g, 'alex00', 'com.a', 'A');
    expect(excludedApps(g)).toEqual(['com.a']);
  });

  it('names who asked, when the server recorded it', () => {
    const g = agreeToExclude(two(), 'alex00', 'com.a', 'A');
    expect(openProposals(g)[0].requestedBy).toBeUndefined();
    expect(openProposals({ ...g, requestedBy: { 'com.a': 'alex00' } })[0].requestedBy).toBe('alex00');
  });

  it('counts every app except the ones left out', () => {
    expect(groupMinutes({ 'com.a': 30, 'com.b': 20, 'com.c': 10 }, ['com.b'])).toBe(40);
    expect(groupMinutes({ 'com.a': -5, 'com.b': NaN, 'com.c': 10 }, [])).toBe(10);
  });
});

describe('standings', () => {
  const today = '2026-09-24';

  it('gives the point to the lowest total, and to everyone tied', () => {
    const g = group(
      [
        member('aaaaaa', '2026-09-22', { days: { '2026-09-22': 100, '2026-09-23': 80 } }),
        member('bbbbbb', '2026-09-22', { days: { '2026-09-22': 90, '2026-09-23': 80 } }),
      ],
      '2026-09-22'
    );
    const s = standings(g, today, shared);
    expect(s.days.map((d) => [d.day, d.winners])).toEqual([
      ['2026-09-23', ['aaaaaa', 'bbbbbb']],
      ['2026-09-22', ['bbbbbb']],
    ]);
    const points = Object.fromEntries(s.board.map((b) => [b.memberId, b.points]));
    expect(points).toEqual({ aaaaaa: 1, bbbbbb: 2 });
  });

  it('never scores today, and never treats a missing share as zero', () => {
    const g = group(
      [
        member('aaaaaa', '2026-09-23', { days: { '2026-09-23': 100, '2026-09-24': 5 } }),
        member('bbbbbb', '2026-09-23', { days: {} }),
      ],
      '2026-09-23'
    );
    const s = standings(g, today, shared);
    expect(s.days).toEqual([{ day: '2026-09-23', winners: [], unscored: 'waiting', missing: ['bbbbbb'] }]);
    expect(s.board.every((b) => b.points === 0)).toBe(true);
  });

  it('only counts members from the day they joined', () => {
    const g = group(
      [
        member('aaaaaa', '2026-09-21', { days: { '2026-09-21': 300, '2026-09-22': 300, '2026-09-23': 300 } }),
        member('bbbbbb', '2026-09-23', { days: { '2026-09-23': 10 } }),
      ],
      '2026-09-21'
    );
    const s = standings(g, today, shared);
    expect(s.days.map((d) => d.unscored)).toEqual([null, 'too-few', 'too-few']);
    expect(s.days[0].winners).toEqual(['bbbbbb']);
  });

  it('runs streaks over scored days; a day nobody could score neither extends nor breaks one', () => {
    const a = member('aaaaaa', '2026-09-19', {
      days: { '2026-09-19': 10, '2026-09-20': 10, '2026-09-22': 10, '2026-09-23': 10 },
    });
    const b = member('bbbbbb', '2026-09-19', {
      // Nothing synced for the 21st. It is past the grace period, so b sits it
      // out, which leaves too few to score it.
      days: { '2026-09-19': 50, '2026-09-20': 50, '2026-09-22': 50, '2026-09-23': 50 },
    });
    a.days['2026-09-21'] = 10;
    const s = standings(group([a, b], '2026-09-19'), today, shared);
    const sa = s.board.find((x) => x.memberId === 'aaaaaa');
    expect(sa).toMatchObject({ points: 4, streak: 4, best: 4 });
    expect(s.days.find((d) => d.day === '2026-09-21')).toMatchObject({ unscored: 'too-few', missing: ['bbbbbb'] });
  });

  it('breaks a streak on a scored loss', () => {
    const a = member('aaaaaa', '2026-09-21', { days: { '2026-09-21': 10, '2026-09-22': 10, '2026-09-23': 90 } });
    const b = member('bbbbbb', '2026-09-21', { days: { '2026-09-21': 50, '2026-09-22': 50, '2026-09-23': 50 } });
    const s = standings(group([a, b], '2026-09-21'), today, shared);
    expect(s.board.find((x) => x.memberId === 'aaaaaa')).toMatchObject({ points: 2, streak: 0, best: 2 });
    expect(s.board.find((x) => x.memberId === 'bbbbbb')).toMatchObject({ points: 1, streak: 1, best: 1 });
  });

  it("uses whatever supplies each member's number, which is how your live numbers come in", () => {
    const me = member('me0000', '2026-09-23');
    const alex = member('alex00', '2026-09-23', { days: { '2026-09-23': 100 } });
    const s = standings(group([me, alex], '2026-09-23'), today, (m, day) => (m.id === 'me0000' ? 40 : m.days[day]));
    expect(s.days[0].winners).toEqual(['me0000']);
  });
});

describe('the grace period for missing numbers', () => {
  const today = '2026-09-24';
  const three = () => [
    member('aaaaaa', '2026-09-20', { days: { '2026-09-21': 90, '2026-09-23': 90 } }),
    member('bbbbbb', '2026-09-20', { days: { '2026-09-21': 60, '2026-09-23': 60 } }),
    // c's phone never synced either day.
    member('cccccc', '2026-09-20', { days: {} }),
  ];

  it('is two days', () => {
    expect(GRACE_DAYS).toBe(2);
  });

  it('keeps a recent day waiting for everyone', () => {
    const s = standings(group(three(), '2026-09-20'), today, shared);
    expect(s.days.find((d) => d.day === '2026-09-23')).toMatchObject({ unscored: 'waiting', missing: ['cccccc'] });
  });

  it('scores an older day among whoever synced, and says who sat it out', () => {
    const s = standings(group(three(), '2026-09-20'), today, shared);
    expect(s.days.find((d) => d.day === '2026-09-21')).toMatchObject({
      unscored: null,
      winners: ['bbbbbb'],
      missing: ['cccccc'],
    });
    expect(s.board.find((x) => x.memberId === 'bbbbbb')?.points).toBe(1);
  });

  it("never counts the missing member's absence as a zero that wins", () => {
    const s = standings(group(three(), '2026-09-20'), today, shared);
    expect(s.board.find((x) => x.memberId === 'cccccc')?.points).toBe(0);
  });
});

describe('your numbers for upload', () => {
  const today = '2026-09-24';
  const me = member('me0000', '2026-09-22');
  const g = () => group([me, member('alex00', '2026-09-20')], '2026-09-20');

  it('count every app except those left out, from the day you joined', () => {
    let grp = agreeToExclude(g(), 'me0000', 'com.music', 'Music');
    grp = agreeToExclude(grp, 'alex00', 'com.music', 'Music');
    const days = selfDays(grp, 'me0000', today, () => ({ 'com.a': 30, 'com.music': 20 }));
    expect(days).toEqual({ '2026-09-24': 30, '2026-09-23': 30, '2026-09-22': 30 });
  });

  it('leave out a day with nothing recorded, rather than report it as zero', () => {
    // An empty read usually means the data isn't loaded. A zero would
    // overwrite a real number on the server and hand you an unearned win.
    const days = selfDays(g(), 'me0000', today, (d): Record<string, number> =>
      d === '2026-09-23' ? {} : { 'com.a': 10 }
    );
    expect(days).toEqual({ '2026-09-24': 10, '2026-09-22': 10 });
  });

  it('are empty for someone not in the group', () => {
    expect(selfDays(g(), 'stranger', today, () => ({ 'com.a': 10 }))).toEqual({});
  });
});
