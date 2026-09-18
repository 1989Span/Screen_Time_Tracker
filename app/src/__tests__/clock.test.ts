import { dateAt, daysBetween, setFixedClock, startOfToday, currentHour, invalidate } from '../clock';
import { chargeHistory, dates, dayUsage, DEMO_INSTALL_DAYS_AGO, installDate } from '../data';

const PINNED = new Date(2026, 7, 25, 19, 0, 0); // what jest.setup.ts installs
afterEach(() => setFixedClock(PINNED));

describe('clock', () => {
  it('reads the installed clock rather than the wall clock', () => {
    setFixedClock(new Date(2030, 0, 2, 9, 30));
    expect(startOfToday().getFullYear()).toBe(2030);
    expect(startOfToday().getMonth()).toBe(0);
    expect(startOfToday().getDate()).toBe(2);
    expect(currentHour()).toBe(9);
  });

  it('startOfToday strips the time component', () => {
    const t = startOfToday();
    expect([t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  describe('DST safety', () => {
    // Stepping back by 86_400_000ms from local midnight lands at 23:00 the
    // previous day once a DST boundary is crossed, shifting the calendar date.
    it('dateAt walks calendar days across a DST boundary', () => {
      setFixedClock(new Date(2026, 7, 25, 12));
      const DAY = 86400000;
      const today = startOfToday();
      let naiveWrong = 0;
      for (let i = 0; i <= 177; i++) {
        const naive = new Date(today.getTime() - i * DAY);
        const cal = dateAt(i);
        // dateAt must always land on midnight of a real calendar day
        expect(cal.getHours()).toBe(0);
        if (naive.getDate() !== cal.getDate()) naiveWrong++;
      }
      // Only meaningful where the machine's zone actually observes DST.
      const observesDst = today.getTimezoneOffset() !== dateAt(177).getTimezoneOffset();
      if (observesDst) expect(naiveWrong).toBeGreaterThan(0);
    });

    it('daysBetween counts whole calendar days, not 24h blocks', () => {
      expect(daysBetween(new Date(2026, 2, 1), new Date(2026, 2, 2))).toBe(1);
      // Spans the US 2026 DST start (8 Mar); a 23h day must still count as one.
      expect(daysBetween(new Date(2026, 2, 7), new Date(2026, 2, 9))).toBe(2);
      expect(daysBetween(new Date(2026, 2, 1), new Date(2026, 7, 25))).toBe(177);
      expect(daysBetween(new Date(2026, 7, 25), new Date(2026, 2, 1))).toBe(-177);
    });
  });

  describe('day rollover', () => {
    it('drops day-scoped usage caches when the date changes', () => {
      // Fri 28 Aug 2026 -> Sat 29 Aug 2026: weekday/weekend factors differ, so
      // "today so far" must change. If the cache were not invalidated, raw(0)
      // would still hold Friday's numbers under the index 0.
      const fri = new Date(2026, 7, 28, 19);
      const sat = new Date(2026, 7, 29, 19);
      expect(fri.getDay()).toBe(5);
      expect(sat.getDay()).toBe(6);

      setFixedClock(fri);
      const friday = dayUsage().reduce((s, v) => s + v, 0);
      setFixedClock(sat);
      const saturday = dayUsage().reduce((s, v) => s + v, 0);

      expect(friday).toBeGreaterThan(0);
      expect(saturday).not.toBeCloseTo(friday, 5);
    });

    it('range labels follow the clock instead of freezing at import', () => {
      setFixedClock(new Date(2026, 7, 25, 19));
      const a = dates();
      setFixedClock(new Date(2026, 7, 26, 19));
      const b = dates();
      expect(a.day).not.toBe(b.day);
      expect(a.day).toContain('Aug');
    });
  });

  describe('demo ledger is clock-relative', () => {
    it('install date tracks the clock, so history stays bounded', () => {
      setFixedClock(new Date(2026, 7, 25, 19));
      expect(daysBetween(installDate(), startOfToday())).toBe(DEMO_INSTALL_DAYS_AGO);
      expect(chargeHistory()).toHaveLength(DEMO_INSTALL_DAYS_AGO);

      // A year later the ledger is the same length, not 365 rows longer.
      invalidate();
      setFixedClock(new Date(2027, 7, 25, 19));
      expect(chargeHistory()).toHaveLength(DEMO_INSTALL_DAYS_AGO);
    });
  });
});
