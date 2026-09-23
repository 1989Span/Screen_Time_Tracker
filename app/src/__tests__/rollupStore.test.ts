import { recordDay } from '../usage/rollupStore';

/** Every statement the stubbed driver saw, newest run last. */
const sqlLog = () => ((globalThis as unknown as { __sqlLog?: string[] }).__sqlLog ??= []);
const reset = () => (sqlLog().length = 0);
const ran = (needle: string) => sqlLog().some((s) => s.includes(needle));

beforeEach(reset);

describe('recordDay never destroys history on an empty result', () => {
  // The bug this guards: the OS keeps ~10 days and then returns nothing for
  // older ones. recordDay used to DELETE the day before checking whether it had
  // anything to write, so every launch erased exactly the history the rollup
  // exists to preserve. A week of real data collapsed to minutes.
  it('does not delete when there is nothing to record', async () => {
    await recordDay({ day: '2026-09-20', totals: {} });
    expect(ran('DELETE FROM usage_day')).toBe(false);
    expect(ran('INSERT INTO usage_day')).toBe(false);
  });

  it('still marks the day observed, so a quiet day counts as real history', async () => {
    await recordDay({ day: '2026-09-20', totals: {} });
    expect(ran('INSERT OR IGNORE INTO observed_day')).toBe(true);
  });

  it('treats a totals object of only zeros as empty', async () => {
    await recordDay({ day: '2026-09-20', totals: { 'com.a': 0, 'com.b': 0 } });
    expect(ran('DELETE FROM usage_day')).toBe(false);
  });

  it('ignores non-finite minutes rather than writing them', async () => {
    await recordDay({ day: '2026-09-20', totals: { 'com.a': Number.NaN, 'com.b': Number.POSITIVE_INFINITY } });
    expect(ran('DELETE FROM usage_day')).toBe(false);
  });
});

describe('recordDay replaces the day when it does have data', () => {
  it('deletes then inserts, so an app that fell out of use drops out', async () => {
    await recordDay({ day: '2026-09-20', totals: { 'com.a': 12 } });
    const log = sqlLog();
    const del = log.findIndex((s) => s.includes('DELETE FROM usage_day'));
    const ins = log.findIndex((s) => s.includes('INSERT INTO usage_day'));
    expect(del).toBeGreaterThanOrEqual(0);
    expect(ins).toBeGreaterThan(del); // delete first, then write
  });

  it('marks the day observed as well as writing usage', async () => {
    await recordDay({ day: '2026-09-20', totals: { 'com.a': 12 } });
    expect(ran('INSERT OR IGNORE INTO observed_day')).toBe(true);
  });

  it('writes one row per app with usage', async () => {
    await recordDay({ day: '2026-09-20', totals: { 'com.a': 12, 'com.b': 3, 'com.zero': 0 } });
    const execs = sqlLog().filter((s) => s.startsWith('EXEC '));
    expect(execs).toHaveLength(2); // com.zero is dropped
  });
});
