// Test fixtures for groups and contacts.
//
// The app used to ship two seeded groups with five invented members apiece and a
// list of fourteen invented contacts. That data is gone: the app shows only what
// the device reports, and a group needs real people, which needs a backend.
//
// The voting, scoring, streak and contact-search logic is still real and still
// worth testing, so the fixtures live here instead - which is where they belonged
// anyway. A test that depends on shipped sample data breaks the moment the product
// stops shipping it.

import { Contact, Group, Member } from '../groups';
import { CATS } from '../data';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';

/**
 * A source whose series are the categories.
 *
 * Groups is the one feature still shaped around categories: a member's `per`
 * array and a group's excluded ids are both category-indexed. countedTotal maps
 * position to id through the installed source, so these tests need a source that
 * agrees with the fixtures. (Once Groups moves to per-app, this goes with it.)
 */
class CategorySeriesSource implements UsageSource {
  readonly id = 'test-categories';
  status: SourceStatus = 'ready';
  series(): Series[] {
    return CATS.map((c) => ({ id: c.id, name: c.name, color: '#5980a6' }));
  }
  async load() {}
  dayTotals(): number[] {
    return CATS.map(() => 0);
  }
  hourTotals(): number[] {
    return CATS.map(() => 0);
  }
  invalidate() {}
}

/** Install it; call from beforeEach in any suite that exercises groups. */
export const installCategorySeries = () => setUsageSource(new CategorySeriesSource());

/** A per-app source of `n` apps, for asserting groups survives a real selection. */
export function installAppSeries(n: number) {
  setUsageSource({
    id: 'test-apps',
    status: 'ready' as SourceStatus,
    series: (): Series[] =>
      Array.from({ length: n }, (_, i) => ({ id: 'app.' + i, name: 'App ' + i, color: '#123456' })),
    load: async () => {},
    dayTotals: () => new Array<number>(n).fill(0),
    hourTotals: () => new Array<number>(n).fill(0),
    invalidate: () => {},
  });
}

/**
 * A member whose usage is fully controlled.
 *
 * `perDay` maps a day offset to total minutes; anything unlisted falls back to
 * `base`. Spread evenly across categories unless `weights` says otherwise, so
 * exclusion tests can move usage into one category.
 */
export function testMember(
  id: string,
  name: string,
  opts: { joined: number; base?: number; perDay?: Record<number, number>; weights?: Record<string, number> } = {
    joined: 0,
  }
): Member {
  const { joined, base = 0, perDay = {}, weights } = opts;
  return {
    id,
    name,
    color: '#5980a6',
    joined,
    seed: 0,
    scale: [],
    day: (idx: number) => {
      const total = perDay[idx] ?? base;
      if (weights) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
        return CATS.map((c) => (total * (weights[c.id] ?? 0)) / sum);
      }
      return CATS.map(() => total / CATS.length);
    },
  };
}

export function testGroup(id: string, name: string, created: number, members: Member[]): Group {
  return { id, name, created, members };
}

export function testContact(over: Partial<Contact> & { id: string; name: string }): Contact {
  return { phone: '(555) 000-0000', hasApp: true, ...over };
}

/** A contact list shaped like the one the search tests need: mixed area codes,
 *  mixed hasApp, and some already mapped onto existing group members. */
export const TEST_CONTACTS: Contact[] = [
  testContact({ id: 'c-alex', name: 'Alex Chen', phone: '(555) 201-4432', hasApp: true }),
  testContact({ id: 'c-chris', name: 'Chris Patel', phone: '(555) 318-0921', hasApp: true }),
  testContact({ id: 'c-dana', name: 'Dana Kim', phone: '(850) 764-2210', hasApp: false }),
  testContact({ id: 'c-maya', name: 'Maya', phone: '(555) 347-7702', hasApp: true, memberId: 'maya' }),
  testContact({ id: 'c-morgan', name: 'Morgan Lee', phone: '(555) 850-6619', hasApp: false }),
  testContact({ id: 'c-sam', name: 'Sam Rivera', phone: '(555) 931-4458', hasApp: false }),
];
