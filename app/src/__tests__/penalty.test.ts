import { invalidate, setFixedClock } from '../clock';
import {
  PenaltySetting,
  RATE_MAX,
  RATE_MIN,
  chargeFor,
  chargeHistory,
  daysUntilUnlock,
  fmtDate,
  fmtMoney,
  fmtShort,
  limLabel,
  minutesOver,
  trackedToday,
  unlockDateFrom,
} from '../data';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';
import { emptySource } from '../usage/emptySource';

const PINNED = new Date(2026, 7, 25, 19, 0, 0);

/** A source with one series reporting a fixed number of minutes every day, so
 *  ledger arithmetic can be asserted exactly rather than against generated data. */
class FixedSource implements UsageSource {
  readonly id = 'fixed';
  readonly status: SourceStatus = 'ready';
  constructor(private readonly minutesPerDay: number) {}
  series(): Series[] {
    return [{ id: 'com.example.app', name: 'Example', color: '#000000' }];
  }
  async load() {}
  allAppsDay(): Record<string, number> {
    return {};
  }
  invalidate() {}
  dayTotals(): number[] {
    return [this.minutesPerDay];
  }
  hourTotals(): number[] {
    return [this.minutesPerDay / 24];
  }
}

afterEach(() => {
  setUsageSource(emptySource);
  setFixedClock(PINNED);
  invalidate();
});
const dollar: PenaltySetting = { limit: 60, rate: 1 };

describe('minutes over the limit', () => {
  it('counts whole minutes only', () => {
    expect(minutesOver(60, 60)).toBe(0);
    expect(minutesOver(60.9, 60)).toBe(0);
    expect(minutesOver(61, 60)).toBe(1);
    expect(minutesOver(66.9, 60)).toBe(6);
  });

  it('is zero under the limit', () => {
    expect(minutesOver(0, 60)).toBe(0);
    expect(minutesOver(59.5, 60)).toBe(0);
  });
});

describe('charges', () => {
  it('multiplies whole minutes over by the rate', () => {
    expect(chargeFor(90, dollar)).toBe(30);
    expect(chargeFor(60, dollar)).toBe(0);
    expect(chargeFor(75, { limit: 60, rate: 0.25 })).toBe(3.75);
  });

  it('rounds to whole cents', () => {
    expect(chargeFor(63, { limit: 60, rate: 0.333 })).toBe(1); // 3 x 0.333 = 0.999
    expect(chargeFor(61, { limit: 60, rate: 0.005 })).toBe(0.01);
  });

  it('has no daily cap', () => {
    expect(chargeFor(1440, { limit: 1, rate: 5 })).toBe(7195);
  });
});

describe('money formatting', () => {
  it('always shows two decimal places', () => {
    expect(fmtMoney(0)).toBe('$0.00');
    expect(fmtMoney(0.05)).toBe('$0.05');
    expect(fmtMoney(2.1)).toBe('$2.10');
  });

  it('groups thousands', () => {
    expect(fmtMoney(1234.5)).toBe('$1,234.50');
    expect(fmtMoney(1234567.891)).toBe('$1,234,567.89');
  });
});

describe('rate limits', () => {
  it('spans one cent to a thousand dollars a minute', () => {
    expect(RATE_MIN).toBe(0.01);
    expect(RATE_MAX).toBe(1000);
  });
});

describe('the ledger', () => {
  const setting: PenaltySetting = { limit: 60, rate: 0.5 };

  beforeEach(() => {
    setUsageSource(new FixedSource(90)); // 30 minutes over a 60-minute limit
    setFixedClock(PINNED);
    invalidate();
  });

  it('is empty when no penalty has been set', () => {
    // Nothing is charged until the user opts in.
    expect(chargeHistory(null, 30)).toEqual([]);
  });

  it('is empty before the penalty was switched on', () => {
    // A limit set today cannot have charged for yesterday.
    expect(chargeHistory(setting, 0)).toEqual([]);
  });

  it('covers only the days the penalty has been active, excluding today', () => {
    // Today has not settled, so 5 active days means 5 settled rows behind it.
    expect(chargeHistory(setting, 5)).toHaveLength(5);
    expect(chargeHistory(setting, 1)).toHaveLength(1);
  });

  it('charges each day by that day’s overage at the chosen rate', () => {
    for (const day of chargeHistory(setting, 4)) {
      expect(day.limit).toBe(setting.limit);
      expect(day.over).toBe(minutesOver(day.used, setting.limit));
      expect(day.over).toBe(30);
      expect(day.charge).toBeCloseTo(15, 2); // 30 minutes x $0.50
    }
  });

  it('runs the balance up day by day, newest row holding the total', () => {
    const history = chargeHistory(setting, 4);
    let running = 0;
    for (const day of [...history].reverse()) {
      running = Math.round((running + day.charge) * 100) / 100;
      expect(day.balance).toBeCloseTo(running, 2);
    }
    expect(history[0].balance).toBeCloseTo(
      history.reduce((sum, d) => sum + d.charge, 0),
      2
    );
  });

  it('charges nothing on days under the limit', () => {
    setUsageSource(new FixedSource(30)); // under a 60-minute limit
    invalidate();
    const history = chargeHistory(setting, 3);
    expect(history).toHaveLength(3);
    for (const day of history) {
      expect(day.over).toBe(0);
      expect(day.charge).toBe(0);
      expect(day.balance).toBe(0);
    }
  });

  it('orders rows newest first', () => {
    const history = chargeHistory(setting, 3);
    expect(history[0].label).toContain('24 Aug');
    expect(history[history.length - 1].label).toContain('22 Aug');
  });
});

describe('unlocking', () => {
  it('unlocks one year after the penalty started', () => {
    const start = new Date(2026, 2, 1);
    expect(fmtDate(unlockDateFrom(start))).toBe('1 Mar 2027');
  });

  it('counts the days remaining from today', () => {
    setFixedClock(PINNED); // 25 Aug 2026
    expect(daysUntilUnlock(new Date(2026, 2, 1))).toBe(188);
  });
});

describe('today so far', () => {
  beforeEach(() => {
    setUsageSource(new FixedSource(120));
    setFixedClock(PINNED);
    invalidate();
  });

  it('counts only what you track', () => {
    expect(trackedToday()).toBeCloseTo(120, 6);
  });

  it('produces a charge once today passes the limit', () => {
    const used = trackedToday();
    const setting: PenaltySetting = { limit: 60, rate: 0.1 };
    expect(minutesOver(used, setting.limit)).toBe(60);
    expect(chargeFor(used, setting)).toBeCloseTo(6, 2);
  });
});

describe('duration labels', () => {
  it('writes limits the short way', () => {
    expect(limLabel(30)).toBe('30m');
    expect(limLabel(60)).toBe('1h');
    expect(limLabel(90)).toBe('1h 30m');
    expect(limLabel(240)).toBe('4h');
  });

  it('drops minutes once a duration passes a day', () => {
    expect(fmtShort(45)).toBe('45m');
    expect(fmtShort(90)).toBe('1h 30m');
    expect(fmtShort(1500)).toBe('1d 1h');
  });
});
