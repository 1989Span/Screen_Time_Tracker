import { UsageStats } from '../../modules/usage-stats';
import { invalidate, setFixedClock } from '../clock';
import { CATS, countsUnlocks, fmtUnlocks, prevUnlocks, unlockBuckets } from '../data';
import { emptySource } from '../usage/emptySource';
import { recordOsDays } from '../usage/recorder';
import { Series } from '../usage/series';
import { SourceStatus, UsageSource, setUsageSource } from '../usage/source';

const PINNED = new Date(2026, 8, 22, 19, 0, 0); // Tue 22 Sep 2026, 7pm local
const at = (dayOffset: number, hour: number) => new Date(2026, 8, 22 - dayOffset, hour, 0, 0, 0).getTime();

const sqlLog = () => ((globalThis as unknown as { __sqlLog?: string[] }).__sqlLog ??= []);
const unlockWrites = () => sqlLog().filter((s) => s.includes('INSERT INTO unlock_day'));

/** Ten unlocks every day, and one in each hour. */
class UnlockSource implements UsageSource {
  readonly id = 'unlocks';
  readonly status: SourceStatus = 'ready';
  constructor(private readonly supported = true) {}
  series(): Series[] {
    return CATS.map((c) => ({ id: c.id, name: c.name, color: '#000000' }));
  }
  async load() {}
  allAppsDay(): Record<string, number> {
    return {};
  }
  invalidate() {}
  dayTotals(): number[] {
    return CATS.map(() => 0);
  }
  hourTotals(): number[] {
    return CATS.map(() => 0);
  }
  countsUnlocks() {
    return this.supported;
  }
  unlocksDay() {
    return 10;
  }
  unlocksHour() {
    return 1;
  }
}

beforeEach(() => {
  setFixedClock(PINNED);
  invalidate();
  sqlLog().length = 0;
  jest.restoreAllMocks();
  jest.spyOn(UsageStats, 'hasPermission').mockReturnValue(true);
  jest.spyOn(UsageStats, 'queryEvents').mockResolvedValue([]);
  jest.spyOn(UsageStats, 'queryTotals').mockResolvedValue({});
});

afterEach(() => setUsageSource(emptySource));

describe('recording unlocks', () => {
  it('counts each day from Android while it still remembers them', async () => {
    jest.spyOn(UsageStats, 'queryUnlocks').mockResolvedValue([at(0, 8), at(0, 12), at(1, 22)]);
    const result = await recordOsDays(3);
    expect(result.unlocks).toHaveLength(3);
    // Today and yesterday have unlocks; the quiet day isn't written, so a day
    // Android has forgotten can't overwrite a stored count with zero.
    expect(unlockWrites()).toHaveLength(2);
  });

  it('only ever raises a stored count', async () => {
    jest.spyOn(UsageStats, 'queryUnlocks').mockResolvedValue([at(0, 8)]);
    await recordOsDays(1);
    expect(unlockWrites()[0]).toMatch(/MAX\(count, excluded\.count\)/);
  });

  it('still records screen time when the unlock query fails', async () => {
    jest.spyOn(UsageStats, 'queryUnlocks').mockRejectedValue(new Error('boom'));
    const result = await recordOsDays(2);
    expect(result.daysRecorded).toBe(2);
    expect(result.unlocks).toEqual([]);
    expect(unlockWrites()).toHaveLength(0);
  });
});

describe('unlock counts per range', () => {
  it('has one count per chart bar, in the same order', () => {
    setUsageSource(new UnlockSource());
    expect(unlockBuckets('day')).toHaveLength(24);
    expect(unlockBuckets('week')).toEqual(new Array(7).fill(10));
    expect(unlockBuckets('month').reduce((a, b) => a + b, 0)).toBe(300);
  });

  it('counts the year by month, up to today', () => {
    setUsageSource(new UnlockSource());
    const year = unlockBuckets('year');
    expect(year).toHaveLength(12);
    // September so far: the 1st to the 22nd.
    expect(year[11]).toBe(22 * 10);
  });

  it('compares with the same span before it', () => {
    setUsageSource(new UnlockSource());
    // Yesterday up to this hour (7pm): 0:00 to 19:59 is 20 hours.
    expect(prevUnlocks('day')).toBe(20);
    expect(prevUnlocks('week')).toBe(70);
    expect(prevUnlocks('month')).toBe(300);
  });

  it('shows none, rather than zeros, where unlocks can’t be counted', () => {
    setUsageSource(emptySource);
    expect(countsUnlocks()).toBe(false);
    setUsageSource(new UnlockSource(false));
    expect(countsUnlocks()).toBe(false);
    setUsageSource(new UnlockSource(true));
    expect(countsUnlocks()).toBe(true);
  });

  it('reads naturally', () => {
    expect(fmtUnlocks(1)).toBe('1 unlock');
    expect(fmtUnlocks(48)).toBe('48 unlocks');
    expect(fmtUnlocks(1204)).toBe('1,204 unlocks');
    expect(fmtUnlocks(0)).toBe('0 unlocks');
  });
});
