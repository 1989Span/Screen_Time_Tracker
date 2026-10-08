import { Challenge, challengeResult, currentChallenge, lastDayOf } from '../challenge';
import { Group, Member, newMember } from '../groups';
import { FINAL, challengeNotices } from '../sync/challengeNotices';

const member = (id: string, name: string, joined = '2026-10-01', days: Record<string, number> = {}): Member => ({
  ...newMember(id, name, joined),
  days,
});

const challenge = (over: Partial<Challenge> = {}): Challenge => ({
  id: 'c1',
  groupId: 'g1',
  month: '2026-10-01',
  fee: 1,
  proposedBy: 'sam',
  status: 'active',
  startDay: '2026-10-07',
  players: ['sam', 'lee', 'ana'],
  accepted: ['sam', 'lee', 'ana'],
  declined: [],
  ...over,
});

const group = (members: Member[], challenges: Challenge[] = [challenge()]): Group => ({
  id: 'g1',
  name: 'Family',
  created: '2026-10-01',
  members,
  challenges,
});

const value = (m: Member, day: string) => m.days[day];

describe('a challenge day', () => {
  // Oct 7: Sam lowest. Oct 8: Sam and Lee tie for lowest. Oct 9: Ana's numbers never arrive.
  const sam = member('sam', 'Sam', '2026-10-01', { '2026-10-07': 60, '2026-10-08': 90, '2026-10-09': 100 });
  const lee = member('lee', 'Lee', '2026-10-01', { '2026-10-07': 120, '2026-10-08': 90, '2026-10-09': 50 });
  const ana = member('ana', 'Ana', '2026-10-01', { '2026-10-07': 200, '2026-10-08': 300 });
  const g = group([sam, lee, ana]);
  const r = challengeResult(g, challenge(), '2026-10-20', value);
  const day = (stamp: string) => r.days.find((d) => d.day === stamp)!;

  it('the lowest wins a point and pays nothing; everyone else pays the fee', () => {
    expect(day('2026-10-07').winners).toEqual(['sam']);
    expect(day('2026-10-07').payers).toEqual(['lee', 'ana']);
  });

  it('everyone tied for lowest wins', () => {
    expect(day('2026-10-08').winners).toEqual(['sam', 'lee']);
    expect(day('2026-10-08').payers).toEqual(['ana']);
  });

  it('someone whose numbers never arrive sits the day out: no point, no fee', () => {
    expect(day('2026-10-09').winners).toEqual(['lee']);
    expect(day('2026-10-09').payers).toEqual(['sam']);
    expect(day('2026-10-09').satOut).toEqual(['ana']);
  });

  it('adds up points, payments and the pool', () => {
    expect(r.points).toEqual({ sam: 2, lee: 2, ana: 0 });
    expect(r.paid).toEqual({ sam: 1, lee: 1, ana: 2 });
    expect(r.pool).toBe(4);
  });

  it('starts on the day it started, not before', () => {
    expect(r.days.some((d) => d.day < '2026-10-07')).toBe(false);
  });
});

describe('who plays', () => {
  it('leaves out anyone who joined after it started', () => {
    const late = member('kim', 'Kim', '2026-10-10', { '2026-10-12': 5 });
    const sam = member('sam', 'Sam', '2026-10-01', { '2026-10-12': 100 });
    const lee = member('lee', 'Lee', '2026-10-01', { '2026-10-12': 200 });
    const g = group([sam, lee, late]);
    const r = challengeResult(g, challenge({ players: ['sam', 'lee'] }), '2026-10-13', value);
    const oct12 = r.days.find((d) => d.day === '2026-10-12')!;
    // Kim had the lowest time but isn't playing.
    expect(oct12.winners).toEqual(['sam']);
    expect(r.points.kim).toBeUndefined();
  });

  it('a proposal that hasn’t started has no days or pool', () => {
    const g = group([member('sam', 'Sam'), member('lee', 'Lee')]);
    const r = challengeResult(g, challenge({ status: 'proposed', startDay: null }), '2026-10-20', value);
    expect(r.days).toEqual([]);
    expect(r.pool).toBe(0);
  });
});

describe('the end of the month', () => {
  const days = (v: number) => {
    const out: Record<string, number> = {};
    for (let d = 29; d <= 31; d++) out['2026-10-' + d] = v;
    return out;
  };

  it('isn’t over until the month ends and every day is scored', () => {
    const g = group([member('sam', 'Sam', '2026-10-01', days(60)), member('lee', 'Lee', '2026-10-01', days(90))]);
    const c = challenge({ startDay: '2026-10-29', players: ['sam', 'lee'] });
    expect(challengeResult(g, c, '2026-10-31', value).finished).toBe(false);
    const r = challengeResult(g, c, '2026-11-01', value);
    expect(r.finished).toBe(true);
    expect(r.winners).toEqual(['sam']);
    expect(r.pool).toBe(3);
    expect(r.share).toBe(3);
  });

  it('a tie on points splits the pool evenly', () => {
    const sam = member('sam', 'Sam', '2026-10-01', { '2026-10-30': 60, '2026-10-31': 200 });
    const lee = member('lee', 'Lee', '2026-10-01', { '2026-10-30': 200, '2026-10-31': 60 });
    const ana = member('ana', 'Ana', '2026-10-01', { '2026-10-30': 300, '2026-10-31': 300 });
    const c = challenge({ startDay: '2026-10-30', fee: 2.5 });
    const r = challengeResult(group([sam, lee, ana]), c, '2026-11-02', value);
    expect(r.winners).toEqual(['sam', 'lee']);
    expect(r.pool).toBe(10); // two payers a day for two days at $2.50
    expect(r.share).toBe(5);
  });

  it('still settles the last day once the grace period runs out, if numbers never arrive', () => {
    const sam = member('sam', 'Sam', '2026-10-01', { '2026-10-31': 60 });
    const lee = member('lee', 'Lee', '2026-10-01', { '2026-10-31': 90 });
    const ana = member('ana', 'Ana', '2026-10-01', {});
    const c = challenge({ startDay: '2026-10-31' });
    expect(challengeResult(group([sam, lee, ana]), c, '2026-11-01', value).finished).toBe(false);
    expect(challengeResult(group([sam, lee, ana]), c, '2026-11-03', value).finished).toBe(true);
  });

  it('knows the last day of each month', () => {
    expect(lastDayOf('2026-02-01')).toBe('2026-02-28');
    expect(lastDayOf('2026-10-01')).toBe('2026-10-31');
  });
});

describe('which challenge shows', () => {
  it('this month’s, proposed or running', () => {
    const c = challenge({ status: 'proposed', startDay: null });
    expect(currentChallenge([c], '2026-10-15')).toBe(c);
  });

  it('last month’s result until a new one starts, but not older ones', () => {
    const last = challenge({ month: '2026-09-01' });
    expect(currentChallenge([last], '2026-10-03')).toBe(last);
    expect(currentChallenge([last], '2026-11-03')).toBeNull();
  });

  it('not a declined or withdrawn one', () => {
    expect(currentChallenge([challenge({ status: 'declined' })], '2026-10-15')).toBeNull();
    expect(currentChallenge([challenge({ status: 'withdrawn' })], '2026-10-15')).toBeNull();
  });
});

describe('challenge notifications', () => {
  const sam = member('sam', 'Sam Lee', '2026-10-01', { '2026-10-07': 60, '2026-10-08': 90 });
  const ana = member('ana', 'Ana', '2026-10-01', { '2026-10-07': 200, '2026-10-08': 50 });
  const g = group([sam, ana], [challenge({ players: ['sam', 'ana'] })]);
  const run = (today: string, seen: Record<string, string> = {}, selfId = 'ana') =>
    challengeNotices([g], selfId, today, seen, () => value);

  it('announces each newly settled day once, with what you paid and the pool', () => {
    const first = run('2026-10-11', { c1: '2026-10-07' });
    expect(first.notices).toEqual([
      {
        title: 'Family challenge · Oct 8',
        body: 'You won the day and paid nothing. Pool: $2.00.',
        groupId: 'g1',
      },
    ]);
    expect(first.seen).toEqual({ c1: '2026-10-08' });
    expect(run('2026-10-11', first.seen).notices).toEqual([]);
  });

  it('says who won and what you paid', () => {
    const { notices } = run('2026-10-11', { c1: '2026-10-06' });
    expect(notices[0].body).toBe('Sam won the day. You paid $1.00. Pool: $1.00.');
  });

  it('on first sight, announces only the latest day', () => {
    expect(run('2026-10-11').notices).toHaveLength(1);
  });

  it('announces the winner once the month is settled, then nothing more', () => {
    const { notices, seen } = run('2026-11-05', { c1: '2026-10-08' });
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('October’s challenge in Family is over');
    expect(notices[0].body).toBe('Sam and you tied on 1 point and split $2.00: $1.00 each. (Paper money.)');
    expect(seen.c1).toBe(FINAL);
    expect(run('2026-11-06', seen).notices).toEqual([]);
  });

  it('says nothing to someone who isn’t playing', () => {
    expect(run('2026-10-11', {}, 'kim').notices).toEqual([]);
  });
});
