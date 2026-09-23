import { UsageStats } from '../../modules/usage-stats';
import { setFixedClock } from '../clock';
import { RawEvent } from '../usage/hourly';
import { recordOsDays } from '../usage/recorder';

const PINNED = new Date(2026, 8, 22, 19, 0, 0); // Tue 22 Sep 2026, 7pm local
const at = (dayOffset: number, hour: number, minute = 0) =>
  new Date(2026, 8, 22 - dayOffset, hour, minute, 0, 0).getTime();

const resume = (pkg: string, t: number): RawEvent => ({ packageName: pkg, timeStamp: t, resumed: true });
const pause = (pkg: string, t: number): RawEvent => ({ packageName: pkg, timeStamp: t, resumed: false });

const sqlLog = () => ((globalThis as unknown as { __sqlLog?: string[] }).__sqlLog ??= []);

beforeEach(() => {
  setFixedClock(PINNED);
  sqlLog().length = 0;
  jest.restoreAllMocks();
  jest.spyOn(UsageStats, 'hasPermission').mockReturnValue(true);
});

describe('day totals come from events, not from daily buckets', () => {
  // Daily buckets are aligned to the device's own rollover (measured: 7:16pm),
  // not to midnight, so summing them over a midnight-to-midnight window mixes
  // yesterday evening into today. Events carry real timestamps and can be
  // clipped to an actual local day.
  it('prefers events and never calls queryTotals when events exist', async () => {
    jest.spyOn(UsageStats, 'queryEvents').mockResolvedValue([resume('com.a', at(0, 9)), pause('com.a', at(0, 10))]);
    const totalsSpy = jest.spyOn(UsageStats, 'queryTotals').mockResolvedValue({});

    const result = await recordOsDays(3);

    expect(result.source).toBe('events');
    expect(totalsSpy).not.toHaveBeenCalled();
  });

  it('attributes a session to the day it actually happened on', async () => {
    // One hour yesterday, nothing today.
    jest.spyOn(UsageStats, 'queryEvents').mockResolvedValue([resume('com.a', at(1, 14)), pause('com.a', at(1, 15))]);

    const result = await recordOsDays(3);
    expect(result.packagesSeen).toBe(1);
    // Three days looked at, and each is recorded as observed even when quiet.
    expect(result.daysRecorded).toBe(3);
  });

  it('splits a session that crosses midnight instead of crediting one day', async () => {
    // 23:30 yesterday -> 00:30 today.
    jest
      .spyOn(UsageStats, 'queryEvents')
      .mockResolvedValue([resume('com.a', at(1, 23, 30)), pause('com.a', at(0, 0, 30))]);

    const result = await recordOsDays(2);
    expect(result.source).toBe('events');
    // Both days get a write, because both hold half the session.
    const inserts = sqlLog().filter((s) => s.includes('INSERT INTO usage_day'));
    expect(inserts.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the events it fetched so the source need not query twice', async () => {
    const events = [resume('com.a', at(0, 9)), pause('com.a', at(0, 10))];
    jest.spyOn(UsageStats, 'queryEvents').mockResolvedValue(events);
    const result = await recordOsDays(2);
    expect(result.events).toHaveLength(2);
  });
});

describe('falling back to daily buckets', () => {
  it('uses queryTotals only when there are no events at all', async () => {
    jest.spyOn(UsageStats, 'queryEvents').mockResolvedValue([]);
    const totalsSpy = jest.spyOn(UsageStats, 'queryTotals').mockResolvedValue({ 'com.a': 600_000 });

    const result = await recordOsDays(2);

    expect(result.source).toBe('daily-buckets');
    expect(totalsSpy).toHaveBeenCalled();
    expect(result.packagesSeen).toBe(1);
  });

  it('falls back rather than failing when the events query throws', async () => {
    jest.spyOn(UsageStats, 'queryEvents').mockRejectedValue(new Error('boom'));
    jest.spyOn(UsageStats, 'queryTotals').mockResolvedValue({ 'com.a': 60_000 });

    const result = await recordOsDays(2);
    expect(result.source).toBe('daily-buckets');
    expect(result.daysRecorded).toBe(2);
  });
});

describe('filtering', () => {
  it('drops packages that are never countable, whichever path supplied them', async () => {
    jest.spyOn(UsageStats, 'queryEvents').mockResolvedValue([
      // The screensaver was the second heaviest "app" on the test device.
      resume('com.android.dreams.basic', at(0, 9)),
      pause('com.android.dreams.basic', at(0, 11)),
      resume('com.span1989.gauge', at(0, 11)),
      pause('com.span1989.gauge', at(0, 12)),
      resume('com.instagram.android', at(0, 12)),
      pause('com.instagram.android', at(0, 13)),
    ]);

    const result = await recordOsDays(1);
    // Only Instagram survives: the screensaver and the app itself are excluded.
    expect(result.packagesSeen).toBe(1);
  });
});

describe('permission', () => {
  it('does nothing and says so when usage access is not granted', async () => {
    jest.spyOn(UsageStats, 'hasPermission').mockReturnValue(false);
    const eventsSpy = jest.spyOn(UsageStats, 'queryEvents');

    const result = await recordOsDays(5);

    expect(result.skipped).toBe('no-permission');
    expect(result.daysRecorded).toBe(0);
    expect(eventsSpy).not.toHaveBeenCalled();
  });
});
