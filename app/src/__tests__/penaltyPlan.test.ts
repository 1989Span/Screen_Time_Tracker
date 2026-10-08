import { invalidate, setFixedClock } from '../clock';
import { PenaltySetting } from '../data';
import {
  Plans,
  chargeLedger,
  confirm,
  editState,
  firstChargeDay,
  lastOfMonth,
  nextMonth,
  planFor,
  settingOn,
  totalOf,
} from '../penaltyPlan';
import { emptySource } from '../usage/emptySource';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';

const SIX_HOURS: PenaltySetting = { limit: 360, rate: 1 };
const FOUR_HOURS: PenaltySetting = { limit: 240, rate: 0.5 };

/** One series reporting the same minutes every day. */
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
  setFixedClock(new Date(2026, 7, 25, 19, 0, 0));
  invalidate();
});

describe('months', () => {
  it('knows the last day of each month', () => {
    expect(lastOfMonth('2026-10')).toBe('2026-10-31');
    expect(lastOfMonth('2026-11')).toBe('2026-11-30');
    expect(lastOfMonth('2028-02')).toBe('2028-02-29');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });
});

describe('switching on partway through a month', () => {
  it('starts that day and locks until the month ends', () => {
    const plans = confirm({}, SIX_HOURS, '2026-10-07') as Plans;
    expect(plans['2026-10']).toEqual({ setting: SIX_HOURS, from: '2026-10-07', confirmed: true });
    expect(settingOn(plans, '2026-10-06')).toBeNull();
    expect(settingOn(plans, '2026-10-07')).toEqual(SIX_HOURS);
    expect(editState(plans, '2026-10-08')).toEqual({ kind: 'locked', until: '2026-10-31' });
  });

  it("can't be changed or switched off once locked", () => {
    const plans = confirm({}, SIX_HOURS, '2026-10-07') as Plans;
    expect(confirm(plans, FOUR_HOURS, '2026-10-20')).toBeNull();
    expect(confirm(plans, null, '2026-10-31')).toBeNull();
  });

  it("can't switch off a month that never started", () => {
    expect(confirm({}, null, '2026-10-07')).toBeNull();
  });
});

describe('the next month', () => {
  const october = confirm({}, SIX_HOURS, '2026-10-07') as Plans;

  it('carries over with the same settings, from the 1st', () => {
    expect(planFor(october, '2026-11')).toEqual({ setting: SIX_HOURS, from: '2026-11-01', confirmed: false });
    expect(settingOn(october, '2026-11-01')).toEqual(SIX_HOURS);
  });

  it('can be kept, changed or switched off during the first 4 days', () => {
    for (const day of ['2026-11-01', '2026-11-04']) {
      expect(editState(october, day)).toEqual({ kind: 'window', until: '2026-11-04' });
    }
  });

  it('locks without confirmation once the window passes', () => {
    expect(editState(october, '2026-11-05')).toEqual({ kind: 'locked', until: '2026-11-30' });
  });

  it('applies a change to the whole month, including the window days already gone', () => {
    const plans = confirm(october, FOUR_HOURS, '2026-11-03') as Plans;
    expect(settingOn(plans, '2026-11-01')).toEqual(FOUR_HOURS);
    expect(settingOn(plans, '2026-10-31')).toEqual(SIX_HOURS);
    expect(editState(plans, '2026-11-03')).toEqual({ kind: 'locked', until: '2026-11-30' });
  });

  it('confirming unchanged locks it and stops the window', () => {
    const plans = confirm(october, SIX_HOURS, '2026-11-02') as Plans;
    expect(editState(plans, '2026-11-02').kind).toBe('locked');
  });

  it('switched off, charges nothing all month and carries nothing on', () => {
    const plans = confirm(october, null, '2026-11-02') as Plans;
    expect(settingOn(plans, '2026-11-01')).toBeNull();
    expect(planFor(plans, '2026-12')).toBeNull();
    // And a limit can still be set later that month, starting that day.
    expect(editState(plans, '2026-11-15')).toEqual({ kind: 'open' });
  });

  it('keeps carrying over through months the app was never opened in', () => {
    expect(settingOn(october, '2027-03-15')).toEqual(SIX_HOURS);
  });
});

describe('the ledger', () => {
  beforeEach(() => {
    setUsageSource(new FixedSource(400)); // 40 minutes over a 6-hour limit
    setFixedClock(new Date(2026, 9, 10, 12, 0, 0)); // 10 Oct 2026
    invalidate();
  });

  it('charges each day since the limit started, not today, newest first', () => {
    const plans = confirm({}, SIX_HOURS, '2026-10-07') as Plans;
    const ledger = chargeLedger(plans, '2026-10-10');
    expect(ledger.map((d) => d.stamp)).toEqual(['2026-10-09', '2026-10-08', '2026-10-07']);
    for (const d of ledger) {
      expect(d.over).toBe(40);
      expect(d.charge).toBe(40);
    }
    expect(totalOf(ledger)).toBe(120);
    expect(firstChargeDay(plans)).toBe('2026-10-07');
  });

  it('is empty before anything is set', () => {
    expect(chargeLedger({}, '2026-10-10')).toEqual([]);
  });

  it('charges each month at that month’s settings', () => {
    setFixedClock(new Date(2026, 10, 3, 12, 0, 0)); // 3 Nov
    invalidate();
    const october = confirm({}, SIX_HOURS, '2026-10-30') as Plans;
    const plans = confirm(october, FOUR_HOURS, '2026-11-03') as Plans;
    const ledger = chargeLedger(plans, '2026-11-03');
    const byDay = Object.fromEntries(ledger.map((d) => [d.stamp, d.charge]));
    expect(byDay['2026-10-30']).toBe(40); // 40 over 6h at $1
    expect(byDay['2026-11-01']).toBe(80); // 160 over 4h at $0.50
  });
});
