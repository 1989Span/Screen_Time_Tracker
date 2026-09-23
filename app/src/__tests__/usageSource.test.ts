import { invalidate, setFixedClock } from '../clock';
import { CATS, dayUsage, prevTotal, series, seriesCount, slice, trackedToday } from '../data';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource, usageSource } from '../usage/source';
import { emptySource } from '../usage/emptySource';

const PINNED = new Date(2026, 7, 25, 19, 0, 0);

/** A source with numbers simple enough to assert derived totals by hand. */
class FlatSource implements UsageSource {
  readonly id = 'flat';
  status: SourceStatus = 'ready';
  loadedDays = 0;
  invalidated = 0;
  constructor(private readonly minutesPerCategoryPerDay: number) {}
  series(): Series[] {
    return CATS.map((c) => ({ id: c.id, name: c.name, color: '#000000' }));
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
  setUsageSource(emptySource);
  setFixedClock(PINNED);
  invalidate();
});

describe('the usage source seam', () => {
  it('routes every derivation through the installed source', () => {
    setUsageSource(new FlatSource(60));
    invalidate();

    // 8 categories x 60 min x 7 days
    expect(slice('week', null).total).toBeCloseTo(8 * 60 * 7, 6);
    expect(slice('month', null).total).toBeCloseTo(8 * 60 * 30, 6);
    expect(dayUsage()).toEqual(CATS.map(() => 60));
    expect(trackedToday()).toBeCloseTo(8 * 60, 6);
  });

  it('counts exactly the series the source exposes, with no mask of its own', () => {
    // Selection is applied upstream, by what the source puts in series(). A
    // mask here used to be sized to the 8 legacy categories and silently
    // dropped every app past index 7 once selection became per-app.
    setUsageSource(new FlatSource(60));
    invalidate();
    expect(slice('week', null).rows).toHaveLength(CATS.length);
    expect(slice('week', null).total).toBeCloseTo(CATS.length * 60 * 7, 6);
  });

  it('compares against the previous period using the same source', () => {
    setUsageSource(new FlatSource(30));
    invalidate();
    expect(prevTotal('week')).toBeCloseTo(8 * 30 * 7, 6);
  });

  it('swapping sources changes the numbers, proving nothing is hardcoded', () => {
    setUsageSource(new FlatSource(10));
    invalidate();
    const low = slice('week', null).total;
    setUsageSource(new FlatSource(20));
    invalidate();
    const high = slice('week', null).total;
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
    setUsageSource(new FlatSource(42));
    setFixedClock(PINNED);
    invalidate();

    const first = dayUsage();
    const original = first[0];
    expect(original).toBeGreaterThan(0);

    first[0] = 99999; // a caller mutating what looks like its own result

    expect(dayUsage()[0]).toBeCloseTo(original, 6);
  });

  it('slice totals are unaffected by mutating a previous slice result', () => {
    setUsageSource(new FlatSource(42));
    setFixedClock(PINNED);
    invalidate();

    const before = slice('week', null).total;
    const scoped = slice('week', 3);
    scoped.scoped[0] = 123456;
    expect(slice('week', null).total).toBeCloseTo(before, 6);
  });
});

describe('the series count is not hardwired to eight', () => {
  /** A source with an arbitrary number of series, named like packages. */
  class AppSource implements UsageSource {
    readonly id = 'apps';
    status: SourceStatus = 'ready';
    private readonly list: Series[];
    constructor(
      count: number,
      private readonly minutesEach: number
    ) {
      this.list = Array.from({ length: count }, (_, i) => ({
        id: `com.example.app${i}`,
        name: `App ${i}`,
        color: '#123456',
      }));
    }
    series(): Series[] {
      return this.list;
    }
    async load() {
      this.status = 'ready';
    }
    invalidate() {}
    dayTotals(): number[] {
      return this.list.map(() => this.minutesEach);
    }
    hourTotals(): number[] {
      return this.list.map(() => this.minutesEach / 24);
    }
  }

  it.each([1, 3, 30, 109])('derives correctly over %i series', (count) => {
    setUsageSource(new AppSource(count, 12));
    invalidate();

    expect(seriesCount()).toBe(count);
    expect(series()).toHaveLength(count);
    expect(dayUsage()).toHaveLength(count);
    // count series x 12 min x 7 days
    expect(slice('week', null).total).toBeCloseTo(count * 12 * 7, 6);
    expect(slice('week', null).rows).toHaveLength(count);
  });

  it('labels rows and colours from the series, not a fixed palette', () => {
    setUsageSource(new AppSource(3, 60));
    invalidate();
    const rows = slice('week', null).rows;
    expect(rows.map((r) => r.name).sort()).toEqual(['App 0', 'App 1', 'App 2']);
    expect(new Set(rows.map((r) => r.tone))).toEqual(new Set(['#123456']));
  });

  it('a year of 109 app series still aggregates', () => {
    setUsageSource(new AppSource(109, 5));
    invalidate();
    const single = slice('year', null);

    // The year range is 12 *calendar months* ending with a partial current
    // month, not a flat 365 days, so assert proportionality rather than an
    // absolute figure. (Note N_DAYS.year is 365 and is used for the daily
    // average, which is therefore a slight under-estimate - pre-existing.)
    expect(single.total).toBeGreaterThan(0);
    expect(single.bk).toHaveLength(12);
    expect(single.rows).toHaveLength(109);

    setUsageSource(new AppSource(109, 10));
    invalidate();
    expect(slice('year', null).total).toBeCloseTo(single.total * 2, 6);
  });
});
