import { invalidate, setFixedClock } from '../clock';
import { CATS, dates, daysSoFar, prevTotal, slice } from '../data';
import { emptySource } from '../usage/emptySource';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';

/** One minute a day for every category, so totals count days. */
class MinuteADay implements UsageSource {
  readonly id = 'minute';
  readonly status: SourceStatus = 'ready';
  series(): Series[] {
    return [{ id: CATS[0].id, name: CATS[0].name, color: '#000000' }];
  }
  async load() {}
  allAppsDay(): Record<string, number> {
    return {};
  }
  invalidate() {}
  dayTotals(): number[] {
    return [1];
  }
  hourTotals(): number[] {
    return [1 / 24];
  }
}

const on = (y: number, m: number, d: number) => {
  setFixedClock(new Date(y, m - 1, d, 12));
  invalidate();
};

beforeEach(() => setUsageSource(new MinuteADay()));
afterEach(() => {
  setUsageSource(emptySource);
  setFixedClock(new Date(2026, 7, 25, 19, 0, 0));
  invalidate();
});

describe('calendar periods', () => {
  it('count the days so far: Sunday-start week, calendar month and year', () => {
    on(2026, 10, 17); // a Saturday
    expect(daysSoFar('day')).toBe(1);
    expect(daysSoFar('week')).toBe(7);
    expect(daysSoFar('month')).toBe(17);
    expect(daysSoFar('year')).toBe(290);
    on(2026, 10, 18); // Sunday starts a new week
    expect(daysSoFar('week')).toBe(1);
  });

  it('total only the days so far', () => {
    on(2026, 10, 17);
    expect(slice('week', null).total).toBe(7);
    expect(slice('month', null).total).toBe(17);
    expect(slice('year', null).total).toBe(290);
  });

  it('are labelled as calendar periods', () => {
    on(2026, 10, 17);
    expect(dates()).toEqual({ day: 'Sat 17 Oct', week: '11 – 17 Oct', month: 'October 2026', year: '2026' });
    on(2026, 9, 29); // a week that ends in the next month
    expect(dates().week).toBe('27 Sep – 3 Oct');
  });
});

describe('comparing with the same days of the period before', () => {
  it('a month compares day for day, across a year boundary', () => {
    on(2027, 1, 10);
    expect(prevTotal('month')).toBe(10); // 1-10 December 2026
  });

  it('a month longer than the one before compares with all of it', () => {
    on(2027, 3, 31);
    expect(prevTotal('month')).toBe(28); // all of February 2027
  });

  it('a year compares while history reaches back that far', () => {
    on(2027, 1, 20);
    expect(prevTotal('year')).toBe(20); // 1-20 January 2026, 384 days ago
  });

  it('a year shows no comparison once last year is older than the history kept', () => {
    on(2026, 8, 25);
    // 1 January 2025 is over 400 days back, so there is nothing fair to compare with.
    expect(prevTotal('year')).toBe(0);
  });
});
