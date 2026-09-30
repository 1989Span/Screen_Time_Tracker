import { setFixedClock } from '../clock';
import { RangeId, longDate, slice } from '../data';
import { emptySource } from '../usage/emptySource';
import { setUsageSource } from '../usage/source';

describe('the name shown for a tapped bar', () => {
  let restore: () => void;
  // Tuesday 29 September 2026, mid-afternoon.
  beforeEach(() => {
    restore = setFixedClock(new Date(2026, 8, 29, 15));
    setUsageSource(emptySource);
  });
  afterEach(() => restore());

  const names = (range: RangeId) => slice(range, null).bk.map((b) => b.name);

  it('spells dates out in full', () => {
    expect(longDate(new Date(2026, 8, 29))).toBe('Tuesday, September 29, 2026');
    expect(longDate(new Date(2027, 0, 1))).toBe('Friday, January 1, 2027');
  });

  it('is the hour range in the day chart', () => {
    const day = names('day');
    expect(day).toHaveLength(24);
    expect(day[0]).toBe('12am–1am');
    expect(day[15]).toBe('3pm–4pm');
    expect(day[23]).toBe('11pm–12am');
  });

  it('is the full date in the week chart', () => {
    const week = names('week');
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('Wednesday, September 23, 2026');
    expect(week[6]).toBe('Tuesday, September 29, 2026');
  });

  it('is the full date in the month chart, across the month boundary', () => {
    const month = names('month');
    expect(month).toHaveLength(30);
    expect(month[0]).toBe('Monday, August 31, 2026');
    expect(month[29]).toBe('Tuesday, September 29, 2026');
  });

  it('is the month and year in the year chart', () => {
    const year = names('year');
    expect(year).toHaveLength(12);
    expect(year[0]).toBe('October 2025');
    expect(year[11]).toBe('September 2026');
  });
});
