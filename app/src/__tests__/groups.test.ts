import {
  Group,
  Member,
  agreeToExclude,
  declineExclude,
  excludedApps,
  groupMinutes,
  mergeMembers,
  newMember,
  openProposals,
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

describe('merging shared numbers', () => {
  it('adds someone new', () => {
    const g = mergeMembers(group([member('me0000', '2026-09-20')]), [member('alex00', '2026-09-21')], 'me0000');
    expect(g.members.map((m) => m.id)).toEqual(['me0000', 'alex00']);
  });

  it("takes the newer share's name and votes, and combines days", () => {
    const old = member('alex00', '2026-09-20', {
      name: 'Alex',
      sharedAt: 100,
      days: { '2026-09-20': 50, '2026-09-21': 60 },
    });
    const fresh = member('alex00', '2026-09-20', {
      name: 'Alexandra',
      sharedAt: 200,
      days: { '2026-09-21': 65, '2026-09-22': 70 },
      excludes: { 'com.maps': 'Maps' },
    });
    const g = mergeMembers(group([member('me0000', '2026-09-20'), old]), [fresh], 'me0000');
    const alex = g.members.find((m) => m.id === 'alex00') as Member;
    expect(alex.name).toBe('Alexandra');
    expect(alex.excludes).toEqual({ 'com.maps': 'Maps' });
    // The 20th survives even though the newer share no longer carries it.
    expect(alex.days).toEqual({ '2026-09-20': 50, '2026-09-21': 65, '2026-09-22': 70 });
  });

  it('lets an older link fill gaps but never overwrite newer numbers', () => {
    const have = member('alex00', '2026-09-20', { name: 'New', sharedAt: 200, days: { '2026-09-22': 70 } });
    const late = member('alex00', '2026-09-20', {
      name: 'Old',
      sharedAt: 100,
      days: { '2026-09-21': 60, '2026-09-22': 999 },
    });
    const g = mergeMembers(group([member('me0000', '2026-09-20'), have]), [late], 'me0000');
    const alex = g.members.find((m) => m.id === 'alex00') as Member;
    expect(alex.name).toBe('New');
    expect(alex.days).toEqual({ '2026-09-21': 60, '2026-09-22': 70 });
  });

  it("never takes your own entry from someone else's copy of it", () => {
    const me = member('me0000', '2026-09-20', { name: 'Me', excludes: {} });
    const forged = member('me0000', '2026-09-20', { name: 'Hacked', sharedAt: 999, excludes: { 'com.x': 'X' } });
    const g = mergeMembers(group([me]), [forged], 'me0000');
    expect(g.members).toEqual([me]);
  });

  it('keeps the earliest join date', () => {
    const have = member('alex00', '2026-09-20', { sharedAt: 100 });
    const g = mergeMembers(group([have]), [member('alex00', '2026-09-23', { sharedAt: 200 })], 'me0000');
    expect(g.members[0].joined).toBe('2026-09-20');
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

  it('runs streaks over scored days, and a day nobody could score neither extends nor breaks one', () => {
    const a = member('aaaaaa', '2026-09-19', {
      days: { '2026-09-19': 10, '2026-09-20': 10, '2026-09-22': 10, '2026-09-23': 10 },
    });
    const b = member('bbbbbb', '2026-09-19', {
      // Nothing shared for the 21st, so that day waits.
      days: { '2026-09-19': 50, '2026-09-20': 50, '2026-09-22': 50, '2026-09-23': 50 },
    });
    a.days['2026-09-21'] = 10;
    const s = standings(group([a, b], '2026-09-19'), today, shared);
    const sa = s.board.find((x) => x.memberId === 'aaaaaa');
    expect(sa).toMatchObject({ points: 4, streak: 4, best: 4 });
    expect(s.days.find((d) => d.day === '2026-09-21')?.unscored).toBe('waiting');
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
