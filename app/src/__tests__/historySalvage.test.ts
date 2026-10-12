import * as SQLite from 'expo-sqlite';

import { trackedPerDay } from '../usage/mirror';
import { readDay, resetForTests } from '../usage/rollupStore';

type Row = Record<string, unknown>;

/** A fake database that records writes and answers reads from a script. */
function fakeDb(read: (sql: string, args: unknown[]) => Row[] | Error) {
  const writes: { sql: string; args: unknown[] }[] = [];
  const db = {
    writes,
    execAsync: async () => {},
    runAsync: async (sql: string, ...args: unknown[]) => {
      writes.push({ sql, args });
      return { changes: 0, lastInsertRowId: 0 };
    },
    getFirstAsync: async () => undefined,
    getAllAsync: async (sql: string, ...args: unknown[]) => {
      const r = read(sql, args);
      if (r instanceof Error) throw r;
      return r;
    },
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    closeAsync: async () => {},
  };
  return db;
}

afterEach(() => {
  jest.restoreAllMocks();
  resetForTests();
});

describe('moving history out of the damaged file', () => {
  it('copies a readable old file whole, then deletes it', async () => {
    const fresh = fakeDb(() => []);
    const old = fakeDb((sql) =>
      sql.startsWith('SELECT day, package, minutes FROM usage_day')
        ? [{ day: '2026-08-20', package: 'com.a', minutes: 30 }]
        : sql.startsWith('SELECT day, count FROM unlock_day')
          ? [{ day: '2026-08-20', count: 41 }]
          : []
    );
    jest
      .spyOn(SQLite, 'openDatabaseAsync')
      .mockImplementation(async (name: string) => (name === 'gauge-history.db' ? old : fresh) as never);
    const del = jest.spyOn(SQLite, 'deleteDatabaseAsync').mockResolvedValue();

    await readDay('2026-08-20');

    const inserted = fresh.writes.filter((w) => w.sql.startsWith('INSERT OR IGNORE INTO usage_day'));
    expect(inserted.map((w) => w.args)).toEqual([['2026-08-20', 'com.a', 30]]);
    expect(fresh.writes.some((w) => w.sql.startsWith('INSERT OR IGNORE INTO unlock_day'))).toBe(true);
    expect(del).toHaveBeenCalledWith('gauge-history.db');
    expect(fresh.writes.some((w) => w.args.includes('salvagedV1'))).toBe(true);
  });

  it('rescues day by day when the old table can’t be read whole', async () => {
    const fresh = fakeDb(() => []);
    const old = fakeDb((sql, args) => {
      if (sql === 'SELECT day FROM observed_day') return [{ day: '2026-08-20' }, { day: '2026-08-21' }];
      if (sql === 'SELECT day, package, minutes FROM usage_day') return new Error('database disk image is malformed');
      if (sql.includes('WHERE day = ?')) {
        // One good day, one on a damaged page.
        if (args[0] === '2026-08-20') return [{ day: '2026-08-20', package: 'com.a', minutes: 12 }];
        if (args[0] === '2026-08-21') return new Error('database disk image is malformed');
      }
      return [];
    });
    jest
      .spyOn(SQLite, 'openDatabaseAsync')
      .mockImplementation(async (name: string) => (name === 'gauge-history.db' ? old : fresh) as never);
    jest.spyOn(SQLite, 'deleteDatabaseAsync').mockResolvedValue();

    await readDay('2026-08-20');

    const inserted = fresh.writes.filter((w) => w.sql.startsWith('INSERT OR IGNORE INTO usage_day'));
    expect(inserted.map((w) => w.args)).toEqual([['2026-08-20', 'com.a', 12]]);
  });

  it('carries on with an empty history when the old file can’t be opened at all', async () => {
    const fresh = fakeDb(() => []);
    jest.spyOn(SQLite, 'openDatabaseAsync').mockImplementation(async (name: string) => {
      if (name === 'gauge-history.db') throw new Error('file is not a database');
      return fresh as never;
    });
    jest.spyOn(SQLite, 'deleteDatabaseAsync').mockResolvedValue();

    await expect(readDay('2026-08-20')).resolves.toEqual({});
    expect(fresh.writes.some((w) => w.args.includes('salvagedV1'))).toBe(true);
  });
});

describe('the history handed to the widget and nudges', () => {
  it('sums each day’s tracked apps only', () => {
    expect(
      trackedPerDay(
        {
          '2026-08-20': { 'com.a': 30, 'com.b': 15, 'com.untracked': 99 },
          '2026-08-21': { 'com.untracked': 40 },
        },
        ['com.a', 'com.b']
      )
    ).toEqual({ '2026-08-20': 45 });
  });
});
