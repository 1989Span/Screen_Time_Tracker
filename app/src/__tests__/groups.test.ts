import { CATS } from '../data';
import {
  CONTACTS,
  GROUPS,
  Group,
  GroupRules,
  INITIAL_RULES,
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

const friends = GROUPS[0];
const family = GROUPS[1];
const noRules: GroupRules = { excluded: [], proposals: [] };
const pointsOf = (g: Group, excluded: string[]) =>
  groupStats(g, excluded).stats.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.member.name]: s.points }), {});
/** Every member agrees, in member order. */
const everyoneAgrees = (g: Group, rules: GroupRules, cat: string) => g.members.reduce((acc, m) => vote(g, acc, cat, m.id), rules);

describe('demo groups', () => {
  it('are two groups that both include you', () => {
    expect(GROUPS.map((g) => g.name)).toEqual(['Friends', 'Family']);
    expect(friends.members).toHaveLength(4);
    expect(family.members).toHaveLength(5);
    for (const g of GROUPS) expect(g.members.some((m) => m.id === 'you')).toBe(true);
  });

  it('start every member on the day the group was created', () => {
    for (const g of GROUPS) for (const m of g.members) expect(m.joined).toBe(g.created);
  });
});

describe('scoring', () => {
  it('awards each settled day to the lowest total', () => {
    const excluded = INITIAL_RULES.friends.excluded;
    const { winnersByDay, stats } = groupStats(friends, excluded);
    expect(winnersByDay).toHaveLength(friends.created);

    winnersByDay.forEach((winners, i) => {
      const idx = i + 1; // index 0 is yesterday
      const totals = friends.members.map((m) => Math.round(countedTotal(m.day(idx), excluded)));
      const lowest = Math.min(...totals);
      const expected = friends.members.filter((_, k) => totals[k] === lowest).map((m) => m.id);
      expect(winners).toEqual(expected);
      expect(winners.length).toBeGreaterThan(0); // a tie awards everyone tied
    });

    // Points are exactly the days each member appears in.
    for (const s of stats) {
      const won = winnersByDay.filter((w) => w.indexOf(s.member.id) >= 0).length;
      expect(s.points).toBe(won);
    }
  });

  it('counts a streak as consecutive wins ending yesterday', () => {
    const { winnersByDay, stats } = groupStats(family, INITIAL_RULES.family.excluded);
    for (const s of stats) {
      let expected = 0;
      while (expected < winnersByDay.length && winnersByDay[expected].indexOf(s.member.id) >= 0) expected++;
      expect(s.streak).toBe(expected);
      expect(s.best).toBeGreaterThanOrEqual(s.streak);
    }
  });

  it('ignores categories the group excluded, in the past as well as today', () => {
    const before = pointsOf(friends, []);
    const after = pointsOf(friends, ['music', 'navigation']);
    expect(after).not.toEqual(before); // rule changes are retroactive
    const totalBefore = Object.values(before).reduce((a, b) => a + b, 0);
    const totalAfter = Object.values(after).reduce((a, b) => a + b, 0);
    // Every day still awards at least one point, so totals can only grow with ties.
    expect(totalBefore).toBeGreaterThanOrEqual(friends.created);
    expect(totalAfter).toBeGreaterThanOrEqual(friends.created);
  });

  it('matches the demo numbers (update deliberately if the demo data changes)', () => {
    expect(pointsOf(friends, INITIAL_RULES.friends.excluded)).toEqual({ You: 11, Maya: 26, Jordan: 28, Priya: 21 });
    expect(pointsOf(family, INITIAL_RULES.family.excluded)).toEqual({
      You: 6,
      Mom: 38,
      Dad: 46,
      Ellie: 12,
      'Grandpa Joe': 30,
    });
  });
});

describe('joining', () => {
  const alex = CONTACTS.find((c) => c.id === 'c-alex')!;

  it('leaves existing points, streaks and past winners untouched', () => {
    const excluded = INITIAL_RULES.friends.excluded;
    const before = groupStats(friends, excluded);
    const after = groupStats(joinGroup(friends, alex), excluded);

    expect(after.winnersByDay).toEqual(before.winnersByDay);
    for (const s of before.stats) {
      const later = after.stats.find((x) => x.member.id === s.member.id)!;
      expect(later.points).toBe(s.points);
      expect(later.streak).toBe(s.streak);
      expect(later.best).toBe(s.best);
    }
  });

  it('starts the newcomer at zero, competing from their join day', () => {
    const joined = joinGroup(friends, alex);
    const newcomer = joined.members[joined.members.length - 1];
    expect(newcomer.id).toBe(memberIdOf(alex));
    expect(newcomer.joined).toBe(0); // today

    const stats = groupStats(joined, []).stats.find((s) => s.member.id === newcomer.id)!;
    expect(stats.points).toBe(0);
    expect(stats.streak).toBe(0);
    expect(stats.best).toBe(0);
    expect(countedTotal(newcomer.day(0), [])).toBeGreaterThan(0); // but they do appear in today's ranking
  });

  it('gives the newcomer usage that is stable between runs', () => {
    const a = joinGroup(friends, alex).members[4];
    const b = joinGroup(friends, alex).members[4];
    expect(countedTotal(a.day(3), [])).toBeCloseTo(countedTotal(b.day(3), []));
  });

  it('only competes from the join day when someone joins partway through', () => {
    const joinedDaysAgo = 10;
    const midJoiner = { ...joinGroup(friends, alex).members[4], joined: joinedDaysAgo };
    const group: Group = { ...friends, members: friends.members.concat([midJoiner]) };
    const { winnersByDay } = groupStats(group, []);

    winnersByDay.forEach((winners, i) => {
      const idx = i + 1;
      if (idx > joinedDaysAgo) expect(winners).not.toContain(midJoiner.id);
    });

    const wins = winnersByDay.filter((w) => w.indexOf(midJoiner.id) >= 0).length;
    const stats = groupStats(group, []).stats.find((s) => s.member.id === midJoiner.id)!;
    expect(stats.points).toBe(wins);
    expect(stats.best).toBeLessThanOrEqual(joinedDaysAgo);

    // The members who were there all along keep the same day-by-day results
    // on the days before the newcomer arrived.
    const before = groupStats(friends, []).winnersByDay;
    for (let i = joinedDaysAgo; i < before.length; i++) expect(winnersByDay[i]).toEqual(before[i]);
  });

  it('awards no point on days the group was below the minimum size', () => {
    const solo = makeGroup('g-solo', 'Solo');
    expect(groupStats(solo, []).winnersByDay).toEqual([]); // created today, nothing settled
    expect(MIN_GROUP_SIZE).toBe(2);
  });
});

describe('voting on tracking rules', () => {
  it('needs every member to agree before a category stops counting', () => {
    let rules = propose(friends, noRules, 'games', 'you');
    expect(rules.excluded).toEqual([]);
    expect(rules.proposals[0]).toMatchObject({ cat: 'games', kind: 'exclude', agreed: ['you'] });

    rules = vote(friends, rules, 'games', 'maya');
    rules = vote(friends, rules, 'games', 'jordan');
    expect(rules.excluded).toEqual([]); // 3 of 4 is not enough

    rules = vote(friends, rules, 'games', 'priya');
    expect(rules.excluded).toEqual(['games']);
    expect(rules.proposals).toHaveLength(0);
  });

  it('needs every member again to bring a category back', () => {
    const excluded: GroupRules = { excluded: ['games'], proposals: [] };
    let rules = propose(friends, excluded, 'games', 'you');
    expect(rules.proposals[0].kind).toBe('include');
    expect(rules.excluded).toEqual(['games']);

    rules = everyoneAgrees(friends, rules, 'games');
    expect(rules.excluded).toEqual([]);
  });

  it('ignores a repeated vote from the same member', () => {
    let rules = propose(friends, noRules, 'games', 'you');
    rules = vote(friends, rules, 'games', 'you');
    rules = vote(friends, rules, 'games', 'you');
    expect(rules.proposals[0].agreed).toEqual(['you']);
    expect(rules.excluded).toEqual([]);
  });

  it('closes the vote when someone declines', () => {
    let rules = propose(friends, noRules, 'games', 'you');
    rules = vote(friends, rules, 'games', 'maya');
    rules = decline(rules, 'games');
    expect(rules.proposals).toHaveLength(0);
    expect(rules.excluded).toEqual([]);
  });

  it('closes the vote once nobody still supports it', () => {
    let rules = propose(friends, noRules, 'games', 'you');
    rules = vote(friends, rules, 'games', 'maya');
    rules = withdraw(rules, 'games', 'you');
    expect(rules.proposals[0].agreed).toEqual(['maya']);
    rules = withdraw(rules, 'games', 'maya');
    expect(rules.proposals).toHaveLength(0);
  });

  it('does not let one person decide for a group below the minimum size', () => {
    const solo = makeGroup('g-solo', 'Solo');
    const rules = propose(solo, noRules, 'games', 'you');
    expect(rules.excluded).toEqual([]);
    expect(rules.proposals).toHaveLength(1); // waits for someone to join

    const joined = joinGroup(
      solo,
      CONTACTS.find((c) => c.id === 'c-sam')!
    );
    const settled = vote(joined, rules, 'games', memberIdOf(CONTACTS.find((c) => c.id === 'c-sam')!));
    expect(settled.excluded).toEqual(['games']);
  });

  it('keeps at least one category tracked', () => {
    const allButTwo = CATS.slice(0, CATS.length - 2).map((c) => c.id);
    const rules: GroupRules = { excluded: allButTwo, proposals: [] };
    const [secondLast, last] = CATS.slice(-2).map((c) => c.id);

    expect(canProposeExclude(rules, secondLast)).toBe(true);
    const open = propose(friends, rules, secondLast, 'you');
    // A second vote can't open while the first would take the last one away.
    expect(canProposeExclude(open, last)).toBe(false);
    expect(propose(friends, open, last, 'you').proposals).toHaveLength(1);

    const oneLeft = everyoneAgrees(friends, open, secondLast);
    expect(oneLeft.excluded).toHaveLength(CATS.length - 1);
    expect(canProposeExclude(oneLeft, last)).toBe(false);
  });

  it('will not settle a seeded vote that would leave nothing tracked', () => {
    const allButTwo = CATS.slice(0, CATS.length - 2).map((c) => c.id);
    const [secondLast, last] = CATS.slice(-2).map((c) => c.id);
    let rules: GroupRules = {
      excluded: allButTwo,
      proposals: [
        { cat: secondLast, kind: 'exclude', agreed: [] },
        { cat: last, kind: 'exclude', agreed: [] },
      ],
    };
    rules = everyoneAgrees(friends, rules, secondLast);
    rules = everyoneAgrees(friends, rules, last);

    expect(rules.excluded).toHaveLength(CATS.length - 1);
    expect(rules.proposals).toHaveLength(1); // the second one stays open
    expect(CATS.filter((c) => rules.excluded.indexOf(c.id) < 0)).toHaveLength(1);
  });
});

describe('counted totals', () => {
  it('drops excluded categories only', () => {
    const per = CATS.map((_, i) => (i + 1) * 10);
    const all = per.reduce((a, b) => a + b, 0);
    expect(countedTotal(per, [])).toBe(all);
    expect(countedTotal(per, [CATS[0].id])).toBe(all - 10);
    expect(
      countedTotal(
        per,
        CATS.map((c) => c.id)
      )
    ).toBe(0);
  });
});

describe('contact search', () => {
  it('lists the demo contacts, some with the app and some without', () => {
    expect(CONTACTS).toHaveLength(14);
    expect(CONTACTS.filter((c) => c.hasApp)).toHaveLength(10);
  });

  it('matches names, ignoring case and position', () => {
    const names = (q: string) => CONTACTS.filter((c) => contactMatches(c, q)).map((c) => c.name);
    expect(names('maya')).toEqual(['Maya']);
    expect(names('KIM')).toEqual(['Dana Kim']);
    expect(names('')).toHaveLength(CONTACTS.length);
  });

  it('matches an area code however it is typed', () => {
    const names = (q: string) => CONTACTS.filter((c) => contactMatches(c, q)).map((c) => c.name);
    const area850 = ['Dana Kim', 'Dad', 'Ellie', 'Grandpa Joe', 'Mom'];
    expect(names('850')).toEqual(area850);
    expect(names('(850)')).toEqual(area850);
    expect(names(' 850 ')).toEqual(area850);
  });

  it('matches a full number with punctuation or a +1 prefix', () => {
    const dad = CONTACTS.find((c) => c.name === 'Dad')!;
    expect(contactMatches(dad, '8504108876')).toBe(true);
    expect(contactMatches(dad, '(850) 410-8876')).toBe(true);
    expect(contactMatches(dad, '+1 850 410 8876')).toBe(true);
    expect(contactMatches(dad, '8504108877')).toBe(false);
  });

  it('matches the local part only from four digits up, so 3 digits stay an area code', () => {
    const morgan = CONTACTS.find((c) => c.name === 'Morgan Lee')!; // (555) 850-6619
    expect(contactMatches(morgan, '850')).toBe(false);
    expect(contactMatches(morgan, '8506')).toBe(true);
  });
});

describe('contact identity', () => {
  it('maps known contacts onto their existing member id', () => {
    expect(memberIdOf(CONTACTS.find((c) => c.id === 'c-maya')!)).toBe('maya');
    expect(friends.members.map((m) => m.id)).toContain('maya');
  });

  it('falls back to the contact id for people not yet in a group', () => {
    expect(memberIdOf(CONTACTS.find((c) => c.id === 'c-alex')!)).toBe('c-alex');
  });
});
