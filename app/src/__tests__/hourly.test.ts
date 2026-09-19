import { RawEvent, dayWindow, hourSeries, hourlyFromEvents } from '../usage/hourly';

/** 19 Sep 2026 at a given local hour/minute. */
const at = (hour: number, minute = 0) => new Date(2026, 8, 19, hour, minute, 0, 0).getTime();
const DAY_START = at(0);
const DAY_END = new Date(2026, 8, 20, 0, 0, 0, 0).getTime();

const resume = (pkg: string, t: number): RawEvent => ({ packageName: pkg, timeStamp: t, resumed: true });
const pause = (pkg: string, t: number): RawEvent => ({ packageName: pkg, timeStamp: t, resumed: false });

const round = (n: number) => Math.round(n * 1000) / 1000;

describe('hourlyFromEvents', () => {
  it('credits a session inside one hour to that hour', () => {
    const u = hourlyFromEvents([resume('a', at(9, 10)), pause('a', at(9, 40))], DAY_START, DAY_END);
    expect(round(u.totals.a)).toBe(30);
    expect(round(u.byHour[9].a)).toBe(30);
    expect(u.byHour[8]).toBeUndefined();
    expect(u.byHour[10]).toBeUndefined();
  });

  it('splits a session across the hours it actually covers', () => {
    // 09:30 -> 11:15 is 30 min in hour 9, 60 in hour 10, 15 in hour 11.
    const u = hourlyFromEvents([resume('a', at(9, 30)), pause('a', at(11, 15))], DAY_START, DAY_END);
    expect(round(u.byHour[9].a)).toBe(30);
    expect(round(u.byHour[10].a)).toBe(60);
    expect(round(u.byHour[11].a)).toBe(15);
    expect(round(u.totals.a)).toBe(105);
  });

  it('closes an open session at the end of the window', () => {
    // Still foreground; must run to window end, not forever.
    const u = hourlyFromEvents([resume('a', at(23, 30))], DAY_START, DAY_END);
    expect(round(u.totals.a)).toBe(30);
    expect(round(u.byHour[23].a)).toBe(30);
  });

  it('treats another app resuming as the end of the previous session', () => {
    // This is what covers pause events lost to a force-stop or process death.
    const u = hourlyFromEvents([resume('a', at(9)), resume('b', at(9, 20)), pause('b', at(9, 50))], DAY_START, DAY_END);
    expect(round(u.totals.a)).toBe(20);
    expect(round(u.totals.b)).toBe(30);
  });

  it('does not let a missing pause run an app for the whole day', () => {
    const u = hourlyFromEvents([resume('a', at(1)), resume('b', at(2)), pause('b', at(2, 5))], DAY_START, DAY_END);
    expect(round(u.totals.a)).toBe(60);
    expect(round(u.totals.b)).toBe(5);
  });

  it('clips sessions that begin before the window', () => {
    const before = new Date(2026, 8, 18, 23, 0, 0, 0).getTime();
    const u = hourlyFromEvents([resume('a', before), pause('a', at(0, 30))], DAY_START, DAY_END);
    // Only the 30 minutes after midnight count.
    expect(round(u.totals.a)).toBe(30);
    expect(round(u.byHour[0].a)).toBe(30);
    expect(u.byHour[23]).toBeUndefined();
  });

  it('sorts out-of-order events instead of producing negative time', () => {
    const u = hourlyFromEvents([pause('a', at(9, 40)), resume('a', at(9, 10))], DAY_START, DAY_END);
    expect(round(u.totals.a)).toBe(30);
    expect(Object.values(u.totals).every((v) => v >= 0)).toBe(true);
  });

  it('ignores a pause for an app that is not open', () => {
    const u = hourlyFromEvents([pause('ghost', at(5)), resume('a', at(9)), pause('a', at(9, 15))], DAY_START, DAY_END);
    expect(u.totals.ghost).toBeUndefined();
    expect(round(u.totals.a)).toBe(15);
  });

  it('handles a duplicate resume for the same app without double counting', () => {
    const u = hourlyFromEvents([resume('a', at(9)), resume('a', at(9, 10)), pause('a', at(9, 30))], DAY_START, DAY_END);
    // 09:00-09:10 then 09:10-09:30; 30 minutes total, not 50.
    expect(round(u.totals.a)).toBe(30);
  });

  it('ignores events with no package name', () => {
    const u = hourlyFromEvents(
      [{ packageName: '', timeStamp: at(9), resumed: true }, resume('a', at(9, 10)), pause('a', at(9, 20))],
      DAY_START,
      DAY_END
    );
    expect(round(u.totals.a)).toBe(10);
    expect(u.totals['']).toBeUndefined();
  });

  it('returns empty structures for no events', () => {
    const u = hourlyFromEvents([], DAY_START, DAY_END);
    expect(u.totals).toEqual({});
    expect(u.byHour).toEqual({});
  });

  it('a full day of alternating use sums to the time actually spent', () => {
    const events: RawEvent[] = [];
    // 10 minutes on the hour, every hour.
    for (let h = 0; h < 24; h++) {
      events.push(resume('a', at(h, 0)));
      events.push(pause('a', at(h, 10)));
    }
    const u = hourlyFromEvents(events, DAY_START, DAY_END);
    expect(round(u.totals.a)).toBe(240);
    expect(hourSeries(u, 'a').every((m) => round(m) === 10)).toBe(true);
  });
});

describe('hourSeries', () => {
  it('returns 24 slots with zeros where there was no usage', () => {
    const u = hourlyFromEvents([resume('a', at(9)), pause('a', at(9, 30))], DAY_START, DAY_END);
    const s = hourSeries(u, 'a');
    expect(s).toHaveLength(24);
    expect(round(s[9])).toBe(30);
    expect(s.filter((v) => v > 0)).toHaveLength(1);
  });

  it('returns all zeros for a package with no usage', () => {
    const u = hourlyFromEvents([], DAY_START, DAY_END);
    expect(hourSeries(u, 'nope')).toEqual(new Array(24).fill(0));
  });
});

describe('dayWindow', () => {
  const today = new Date(2026, 8, 19, 14, 30);

  it('spans local midnight to midnight for a past day', () => {
    const w = dayWindow(today, 1, today.getTime());
    expect(new Date(w.start).getDate()).toBe(18);
    expect(new Date(w.start).getHours()).toBe(0);
    expect(new Date(w.end).getDate()).toBe(19);
    expect(w.end - w.start).toBe(86_400_000);
  });

  it('clips today to now, so no future hours are reported', () => {
    const now = today.getTime();
    const w = dayWindow(today, 0, now);
    expect(w.end).toBe(now);
    expect(w.end - w.start).toBeLessThan(86_400_000);
  });

  it('survives a DST transition by using calendar arithmetic', () => {
    // 8 Mar 2026 is the US DST start; the day is 23h where DST is observed.
    const march = new Date(2026, 2, 9, 12, 0);
    const w = dayWindow(march, 1, march.getTime());
    expect(new Date(w.start).getDate()).toBe(8);
    expect(new Date(w.start).getHours()).toBe(0);
    expect(new Date(w.end).getDate()).toBe(9);
  });
});
