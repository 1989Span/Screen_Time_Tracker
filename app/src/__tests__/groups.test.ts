import { CATS } from '../data';
import {
  Group,
  GroupRules,
  MIN_GROUP_SIZE,
  canProposeExclude,
  contactMatches,
  countedTotal,
  decline,
  groupStats,
  joinGroup,
  makeGroup,
  memberIdOf,
  propose,
  vote,
  withdraw,
} from '../groups';
import { TEST_CONTACTS, testContact, testGroup, testMember } from '../__fixtures__/groups';

const noRules: GroupRules = { excluded: [], proposals: [] };

/**
 * Two members over three settled days, with the winner alternating:
 *
 *   idx 3   you 10  bob 30   -> you
 *   idx 2   you 50  bob  5   -> bob
 *   idx 1   you 10  bob 20   -> you
 *
 * Fully determined, so points, streaks and winners can be asserted exactly.
 */
const duel = (): Group =>
  testGroup('duel', 'Duel', 3, [
    testMember('you', 'You', { joined: 3, perDay: { 1: 10, 2: 50, 3: 10 } }),
    testMember('bob', 'Bob', { joined: 3, perDay: { 1: 20, 2: 5, 3: 30 } }),
  ]);

const pointsOf = (g: Group, excluded: string[]) =>
  groupStats(g, excluded).stats.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.member.name]: s.points }), {});

/** Every member agrees, in member order. */
const everyoneAgrees = (g: Group, rules: GroupRules, cat: string) =>
  g.members.reduce((acc, m) => vote(g, acc, cat, m.id), rules);

describe('no data ships with the app', () => {
  it('has no seeded groups or contacts', () => {
    // A group needs real people, which needs a backend. Inventing members with
    // invented usage would misrepresent the user's own standing.

    expect(require('../groups').GROUPS).toEqual([]);
    expect(require('../groups').CONTACTS).toEqual([]);
    expect(require('../groups').INITIAL_RULES).toEqual({});
  });

  it('creates a new group containing only you', () => {
    const g = makeGroup('g1', 'Mine');
    expect(g.members).toHaveLength(1);
    expect(g.members[0].id).toBe('you');
    expect(g.created).toBe(0);
  });
});

describe('scoring', () => {
  it('awards each settled day to the lowest total', () => {
    const { winnersByDay } = groupStats(duel(), []);
    // Index 0 is yesterday, counting backwards from there.
    expect(winnersByDay).toHaveLength(3);
    expect(winnersByDay[0]).toEqual(['you']);
    expect(winnersByDay[1]).toEqual(['bob']);
    expect(winnersByDay[2]).toEqual(['you']);
  });

  it('totals points across the settled days', () => {
    expect(pointsOf(duel(), [])).toEqual({ You: 2, Bob: 1 });
  });

  it('gives every tied member a point', () => {
    const tied = testGroup('t', 'Tied', 2, [
      testMember('you', 'You', { joined: 2, base: 20 }),
      testMember('bob', 'Bob', { joined: 2, base: 20 }),
    ]);
    const { winnersByDay } = groupStats(tied, []);
    for (const day of winnersByDay) expect([...day].sort()).toEqual(['bob', 'you']);
    expect(pointsOf(tied, [])).toEqual({ You: 2, Bob: 2 });
  });

  it('counts a streak as consecutive wins ending yesterday', () => {
    const stats = groupStats(duel(), []).stats;
    const you = stats.find((s) => s.member.id === 'you')!;
    const bob = stats.find((s) => s.member.id === 'bob')!;
    // You won yesterday; Bob did not, so his streak is broken even though he has
    // a win further back.
    expect(you.streak).toBe(1);
    expect(bob.streak).toBe(0);
    expect(you.best).toBe(1);
    expect(bob.best).toBe(1);
  });

  it('ignores categories the group excluded, in the past as well as today', () => {
    // All of Bob's time is in games; excluding games zeroes him out entirely and
    // flips every day to him.
    const g = testGroup('x', 'X', 2, [
      testMember('you', 'You', { joined: 2, base: 10, weights: { social: 1 } }),
      testMember('bob', 'Bob', { joined: 2, base: 90, weights: { games: 1 } }),
    ]);
    expect(pointsOf(g, [])).toEqual({ You: 2, Bob: 0 });
    expect(pointsOf(g, ['games'])).toEqual({ You: 0, Bob: 2 });
  });

  it('awards nothing while the group is below the minimum size', () => {
    const solo = testGroup('s', 'Solo', 3, [testMember('you', 'You', { joined: 3, base: 10 })]);
    const { winnersByDay, stats } = groupStats(solo, []);
    expect(winnersByDay.every((d) => d.length === 0)).toBe(true);
    expect(stats[0].points).toBe(0);
  });
});

describe('countedTotal', () => {
  it('sums only the categories that count', () => {
    const per = CATS.map(() => 10);
    expect(countedTotal(per, [])).toBe(CATS.length * 10);
    expect(countedTotal(per, [CATS[0].id])).toBe((CATS.length - 1) * 10);
    expect(
      countedTotal(
        per,
        CATS.map((c) => c.id)
      )
    ).toBe(0);
  });
});

describe('joining', () => {
  it('starts the newcomer at zero, competing from their join day', () => {
    const g = joinGroup(duel(), testContact({ id: 'c-new', name: 'New' }));
    const stats = groupStats(g, []).stats;
    const newcomer = stats.find((s) => s.member.id === 'c-new')!;
    expect(newcomer.member.joined).toBe(0);
    expect(newcomer.points).toBe(0);
  });

  it('leaves existing points and streaks untouched', () => {
    const before = pointsOf(duel(), []);
    const after = pointsOf(joinGroup(duel(), testContact({ id: 'c-new', name: 'New' })), []);
    expect(after.You).toBe(before.You);
    expect(after.Bob).toBe(before.Bob);
  });

  it('gives the newcomer no usage, rather than an invented profile', () => {
    // The OS only reports this device, so there is nothing truthful to put here.
    const g = joinGroup(duel(), testContact({ id: 'c-new', name: 'New' }));
    const newcomer = g.members.find((m) => m.id === 'c-new')!;
    expect(newcomer.day(1).every((v) => v === 0)).toBe(true);
  });

  it('adopts the member id a contact already has in a group', () => {
    const g = joinGroup(duel(), testContact({ id: 'c-maya', name: 'Maya', memberId: 'maya' }));
    expect(g.members.some((m) => m.id === 'maya')).toBe(true);
  });
});

describe('voting on tracking rules', () => {
  const g = duel(); // 2 members, which is exactly MIN_GROUP_SIZE

  it('needs every member to agree before a category stops counting', () => {
    const one = vote(g, propose(g, noRules, 'games', 'you'), 'games', 'you');
    expect(one.excluded).toEqual([]); // proposer alone is not enough
    const all = everyoneAgrees(g, propose(g, noRules, 'games', 'you'), 'games');
    expect(all.excluded).toEqual(['games']);
    expect(all.proposals).toEqual([]);
  });

  it('needs every member again to bring a category back', () => {
    const excluded: GroupRules = { excluded: ['games'], proposals: [] };
    const reopened = propose(g, excluded, 'games', 'you');
    expect(reopened.proposals[0].kind).toBe('include');
    const settled = everyoneAgrees(g, reopened, 'games');
    expect(settled.excluded).toEqual([]);
  });

  it('ignores a repeated vote from the same member', () => {
    let rules = propose(g, noRules, 'games', 'you');
    rules = vote(g, rules, 'games', 'you');
    rules = vote(g, rules, 'games', 'you');
    expect(rules.proposals[0].agreed).toEqual(['you']);
    expect(rules.excluded).toEqual([]);
  });

  it('closes the vote when someone declines', () => {
    const rules = decline(propose(g, noRules, 'games', 'you'), 'games');
    expect(rules.proposals).toEqual([]);
    expect(rules.excluded).toEqual([]);
  });

  it('closes the vote once nobody still supports it', () => {
    const rules = withdraw(propose(g, noRules, 'games', 'you'), 'games', 'you');
    expect(rules.proposals).toEqual([]);
  });

  it('does not let one person decide for a group below the minimum size', () => {
    const solo = makeGroup('g1', 'Mine'); // just you
    expect(solo.members.length).toBeLessThan(MIN_GROUP_SIZE);
    const rules = everyoneAgrees(solo, propose(solo, noRules, 'games', 'you'), 'games');
    expect(rules.excluded).toEqual([]);
    expect(rules.proposals).toHaveLength(1); // stays open until the group grows
  });

  it('keeps at least one category tracked', () => {
    // Everything excluded but one, then try to exclude the last.
    const allButOne = CATS.slice(0, CATS.length - 1).map((c) => c.id);
    const last = CATS[CATS.length - 1].id;
    const rules: GroupRules = { excluded: allButOne, proposals: [] };
    expect(canProposeExclude(rules, last)).toBe(false);
    const attempted = everyoneAgrees(g, propose(g, rules, last, 'you'), last);
    expect(attempted.excluded).not.toContain(last);
  });

  it('counts other open exclude proposals when judging the last category', () => {
    const excluded = CATS.slice(0, CATS.length - 2).map((c) => c.id);
    const [penultimate, ultimate] = [CATS[CATS.length - 2].id, CATS[CATS.length - 1].id];
    const rules: GroupRules = {
      excluded,
      proposals: [{ cat: penultimate, kind: 'exclude', agreed: ['you'] }],
    };
    // Two remain, but one is already being voted away, so the other cannot be.
    expect(canProposeExclude(rules, ultimate)).toBe(false);
  });
});

describe('contact search', () => {
  const names = (q: string) => TEST_CONTACTS.filter((c) => contactMatches(c, q)).map((c) => c.name);

  it('returns everyone for an empty query', () => {
    expect(names('')).toHaveLength(TEST_CONTACTS.length);
    expect(names('   ')).toHaveLength(TEST_CONTACTS.length);
  });

  it('matches names, ignoring case and position', () => {
    expect(names('chen')).toEqual(['Alex Chen']);
    expect(names('ALEX')).toEqual(['Alex Chen']);
    expect(names('a')).toContain('Alex Chen');
  });

  it('matches an area code however it is typed', () => {
    expect(names('850')).toEqual(['Dana Kim']);
    expect(names('(850)')).toEqual(['Dana Kim']);
  });

  it('matches a full number with punctuation or a +1 prefix', () => {
    expect(names('(555) 201-4432')).toEqual(['Alex Chen']);
    expect(names('15552014432')).toEqual(['Alex Chen']);
  });

  it('matches the local part only from four digits up, so 3 digits stay an area code', () => {
    // 347 as an area code matches nobody here; as a local part it is Maya's.
    expect(names('347')).toEqual([]);
    expect(names('3477')).toEqual(['Maya']);
  });

  it('does not match letters against a phone number', () => {
    expect(names('zzz')).toEqual([]);
  });
});

describe('contact identity', () => {
  it('maps a contact onto the member id they already have', () => {
    expect(memberIdOf(testContact({ id: 'c-maya', name: 'Maya', memberId: 'maya' }))).toBe('maya');
  });

  it('falls back to the contact id for people not yet in a group', () => {
    expect(memberIdOf(testContact({ id: 'c-new', name: 'New' }))).toBe('c-new');
  });
});
