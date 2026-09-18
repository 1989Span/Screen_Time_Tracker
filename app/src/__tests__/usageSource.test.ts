import { invalidate, setFixedClock } from '../clock';
import { CATS, dayUsage, prevTotal, slice, trackedToday } from '../data';
import { Cat } from '../usage/categories';
import { SourceStatus, UsageSource, setUsageSource, usageSource } from '../usage/source';
import { demoSource } from '../usage/demoSource';

const PINNED = new Date(2026, 7, 25, 19, 0, 0);
const allTracked = CATS.map(() => true);

/** A source with numbers simple enough to assert derived totals by hand. */
class FlatSource implements UsageSource {
  readonly id = 'flat';
  status: SourceStatus = 'ready';
  loadedDays = 0;
  invalidated = 0;
  constructor(private readonly minutesPerCategoryPerDay: number) {}
  categories(): Cat[] {
    return CATS;
  }
  async load(days: number) {
    this.loadedDays = days;
    this.status = 'ready';
  }
  invalidate() {
    this.invalidated++;
  }
  dayTotals(): number[] {
    return CATS.map(() => this.minutesPerCategoryPerDay);
  }
  hourTotals(): number[] {
    return CATS.map(() => this.minutesPerCategoryPerDay / 24);
  }
}

afterEach(() => {
  setUsageSource(demoSource);
  setFixedClock(PINNED);
  invalidate();
});

describe('the usage source seam', () => {
  it('routes every derivation through the installed source', () => {
    setUsageSource(new FlatSource(60));
    invalidate();

    // 8 categories x 60 min x 7 days
    expect(slice('week', null, allTracked).total).toBeCloseTo(8 * 60 * 7, 6);
    expect(slice('month', null, allTracked).total).toBeCloseTo(8 * 60 * 30, 6);
    expect(dayUsage()).toEqual(CATS.map(() => 60));
    expect(trackedToday(allTracked)).toBeCloseTo(8 * 60, 6);
  });

  it('honours the tracked flags on top of whatever the source returns', () => {
    setUsageSource(new FlatSource(60));
    invalidate();
    const onlyTwo = CATS.map((_, i) => i < 2);
    expect(slice('week', null, onlyTwo).total).toBeCloseTo(2 * 60 * 7, 6);
  });

  it('compares against the previous period using the same source', () => {
    setUsageSource(new FlatSource(30));
    invalidate();
    expect(prevTotal('week', allTracked)).toBeCloseTo(8 * 30 * 7, 6);
  });

  it('swapping sources changes the numbers, proving nothing is hardcoded', () => {
    setUsageSource(new FlatSource(10));
    invalidate();
    const low = slice('week', null, allTracked).total;
    setUsageSource(new FlatSource(20));
    invalidate();
    const high = slice('week', null, allTracked).total;
    expect(high).toBeCloseTo(low * 2, 6);
  });

  it('clears the source cache when the calendar day rolls over', () => {
    const flat = new FlatSource(60);
    setUsageSource(flat);
    const before = flat.invalidated;
    setFixedClock(new Date(2026, 7, 26, 19)); // next day
    dayUsage(); // any read triggers the rollover check
    expect(flat.invalidated).toBeGreaterThan(before);
  });

  it('refuses to serve data with no source installed, rather than faking it', () => {
    // A release build silently showing generated numbers would be worse than a throw.
    setUsageSource(undefined as unknown as UsageSource);
    expect(() => usageSource()).toThrow(/no usage source/i);
  });
});

describe('source caches cannot be corrupted by callers', () => {
  it('dayUsage hands back a copy, not the cache itself', () => {
    setUsageSource(demoSource);
    setFixedClock(PINNED);
    invalidate();

    const first = dayUsage();
    const original = first[0];
    expect(original).toBeGreaterThan(0);

    first[0] = 99999; // a caller mutating what looks like its own result

    expect(dayUsage()[0]).toBeCloseTo(original, 6);
  });

  it('slice totals are unaffected by mutating a previous slice result', () => {
    setUsageSource(demoSource);
    setFixedClock(PINNED);
    invalidate();

    const before = slice('week', null, allTracked).total;
    const scoped = slice('week', 3, allTracked);
    scoped.scoped[0] = 123456;
    expect(slice('week', null, allTracked).total).toBeCloseTo(before, 6);
  });
});
