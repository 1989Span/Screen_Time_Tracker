import { setFixedClock } from '../clock';
import { longDate, slice } from '../data';
import { emptySource } from '../usage/emptySource';
import { setUsageSource } from '../usage/source';

describe('the date shown for a tapped day', () => {
  it('is spelled out in full', () => {
    expect(longDate(new Date(2026, 8, 29))).toBe('Tuesday, September 29, 2026');
    expect(longDate(new Date(2027, 0, 1))).toBe('Friday, January 1, 2027');
  });

  it('matches the bar that was tapped in the month chart', () => {
    const restore = setFixedClock(new Date(2026, 8, 29, 15));
    setUsageSource(emptySource);
    try {
      const bk = slice('month', null).bk;
      expect(bk).toHaveLength(30);
      // Oldest bar first, today last, across the month boundary.
      expect(longDate(bk[0].date as Date)).toBe('Monday, August 31, 2026');
      expect(longDate(bk[29].date as Date)).toBe('Tuesday, September 29, 2026');
      expect(bk[29].tick).toBe('29');
    } finally {
      restore();
    }
  });
});
