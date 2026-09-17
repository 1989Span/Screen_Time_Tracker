import {
  CATS,
  DEMO_PENALTY,
  INSTALL_DATE,
  PenaltySetting,
  RATE_MAX,
  RATE_MIN,
  UNLOCK_DATE,
  chargeFor,
  chargeHistory,
  daysUntilUnlock,
  fmtDate,
  fmtMoney,
  fmtShort,
  limLabel,
  minutesOver,
  trackedToday,
} from '../data';

const trackAll = CATS.map(() => true);
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

describe('locked balance', () => {
  const history = chargeHistory();

  it('covers every settled day since install, newest first', () => {
    const days = Math.round((UNLOCK_DATE.getTime() - INSTALL_DATE.getTime()) / 86400000) - daysUntilUnlock();
    expect(history).toHaveLength(days);
    expect(history[0].label).toContain('24 Aug');
    expect(history[history.length - 1].label).toContain('1 Mar');
  });

  it('runs the balance up day by day to the final total', () => {
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

  it('charges each day by that day’s overage', () => {
    for (const day of history) {
      expect(day.over).toBe(minutesOver(day.used, day.limit));
      expect(day.charge).toBeCloseTo(Math.round(day.over * DEMO_PENALTY.rate * 100) / 100, 2);
      if (day.over === 0) expect(day.charge).toBe(0);
    }
  });

  it('unlocks one year after install', () => {
    expect(fmtDate(INSTALL_DATE)).toBe('1 Mar 2026');
    expect(fmtDate(UNLOCK_DATE)).toBe('1 Mar 2027');
    expect(daysUntilUnlock()).toBe(188);
  });

  it('matches the demo figures (update deliberately if the demo data changes)', () => {
    expect(DEMO_PENALTY).toEqual({ limit: 240, rate: 0.1 });
    expect(fmtMoney(history[0].balance)).toBe('$4,411.80');
    expect(history).toHaveLength(177);
  });
});

describe('today so far', () => {
  it('counts only the categories you track', () => {
    const all = trackedToday(trackAll);
    const none = trackedToday(CATS.map(() => false));
    const social = trackedToday(CATS.map((c) => c.id === 'social'));

    expect(none).toBe(0);
    expect(social).toBeGreaterThan(0);
    expect(all).toBeGreaterThan(social);
  });

  it('is already over the demo limit, so the card shows a charge', () => {
    const used = trackedToday(trackAll);
    expect(minutesOver(used, DEMO_PENALTY.limit)).toBeGreaterThan(0);
    expect(chargeFor(used, DEMO_PENALTY)).toBeGreaterThan(0);
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
