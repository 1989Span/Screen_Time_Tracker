// The app's own record of per-app, per-day usage.
//
// Why this exists
// ---------------
// Android forgets. Measured on an SM-S942U (Android 16) with usage access
// granted, queryUsageStats returned:
//
//     events    9.8 days     daily    9.8 days    (10 periods)
//     weekly   22.8 days     monthly 160.9 days   (6 periods)
//     yearly  190.9 days     (1 period)
//
// The Week view needs 7 daily buckets and gets them. The Month view needs 30 and
// the OS has about 10; the Year view needs 12 monthly buckets and the OS has 6
// periods over 161 days. So Month and Year cannot be honest from OS data alone -
// the app has to write down each day's totals while it still can, and build real
// history forward from first launch.
//
// Why SQLite rather than AsyncStorage
// -----------------------------------
// AsyncStorage on Android *is* SQLite (databases/RKStorage), just used as an
// opaque key/value blob store. 109 apps x 365 days is ~40,000 values, roughly
// 1.6MB as JSON - close to Android's 2MB CursorWindow limit, and parsing it on
// every launch would block the JS thread for 50-150ms. Here the same engine does
// indexed range reads and SUM/GROUP BY in C instead. Preferences stay in
// AsyncStorage, where the blob shape is a good fit.

import * as SQLite from 'expo-sqlite';

import { dayStamp } from '../clock';

/**
 * The history database. It moved from gauge-history.db, which the widget and
 * nudges used to open with Android's own SQLite while expo-sqlite (a second,
 * separate SQLite in the same process) had it open too. Two SQLite libraries
 * in one process each release the other's POSIX locks when they close the
 * file, and on at least one phone that corrupted it ("database disk image is
 * malformed"). Native code no longer opens the database at all (it reads a
 * mirror, see mirror.ts), and opening this one carries over whatever the old
 * file still holds (salvageV1 below).
 */
const DB_NAME = 'gauge-history-2.db';
const V1_NAME = 'gauge-history.db';
/** How far back to look for days to rescue from a damaged old file. */
const SALVAGE_DAYS = 800;

/** Bump and add a migration below when the schema changes. */
const SCHEMA_VERSION = 3;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// All access is serialised through this chain.
//
// One connection cannot run two transactions at once - SQLite rejects the nested
// BEGIN - and expo-sqlite surfaces that as an opaque "has been rejected" with the
// real cause buried. Callers here are naturally concurrent (a load recording
// fourteen days while a coverage query runs for the range gate), so rather than
// hope they interleave safely, every operation queues.
let tail: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work, work);
  // Keep the chain alive even when one operation rejects.
  tail = run.catch(() => undefined);
  return run;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await migrate(db);
      await salvageV1(db);
      return db;
    })();
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  // WAL keeps a daily write from blocking reads. The primary key is (day,
  // package) so re-recording a day replaces it rather than double-counting -
  // which matters because today's total grows all day and gets rewritten.
  //
  // observed_day records that a day was *looked at*, separately from whether any
  // usage was found. Without it, "we checked and you used nothing" and "we never
  // checked" are indistinguishable, and the only way to tell them apart was to
  // write an empty row set - which meant deleting whatever was already there.
  // That destroyed history on every launch where the OS returned nothing.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS usage_day (
      day     TEXT NOT NULL,
      package TEXT NOT NULL,
      minutes REAL NOT NULL,
      PRIMARY KEY (day, package)
    );
    CREATE INDEX IF NOT EXISTS usage_day_day ON usage_day (day);
    CREATE TABLE IF NOT EXISTS observed_day (
      day TEXT PRIMARY KEY NOT NULL
    );
    -- Phone unlocks per day. Only ever raised, never lowered: see recordUnlocks.
    CREATE TABLE IF NOT EXISTS unlock_day (
      day   TEXT PRIMARY KEY NOT NULL,
      count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    -- Days already holding usage were obviously observed; backfill so the
    -- coverage count does not drop when this migration lands.
    INSERT OR IGNORE INTO observed_day (day) SELECT DISTINCT day FROM usage_day;
  `);
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'schemaVersion');
  if (row?.value !== String(SCHEMA_VERSION)) {
    await db.runAsync(
      'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
      'schemaVersion',
      String(SCHEMA_VERSION)
    );
  }
}

/**
 * Copies the old database into this one, once, then deletes it.
 *
 * Written to survive a damaged file: each table is copied in one read, and if
 * that read fails, usage is copied day by day so one bad page costs only the
 * days on it. Anything unreadable is skipped. The last ~10 days come back from
 * Android anyway on the next load.
 */
async function salvageV1(db: SQLite.SQLiteDatabase): Promise<void> {
  const done = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'salvagedV1');
  if (done) return;

  let old: SQLite.SQLiteDatabase | null = null;
  try {
    old = await SQLite.openDatabaseAsync(V1_NAME);
    const src = old;
    const tryAll = async <T>(sql: string, ...args: string[]): Promise<T[] | null> => {
      try {
        return await src.getAllAsync<T>(sql, ...args);
      } catch {
        return null;
      }
    };

    const observed = (await tryAll<{ day: string }>('SELECT day FROM observed_day')) ?? [];
    let usage = await tryAll<{ day: string; package: string; minutes: number }>(
      'SELECT day, package, minutes FROM usage_day'
    );
    if (usage === null) {
      // The table can't be read whole. Rescue it a day at a time.
      usage = [];
      const days = new Set(observed.map((r) => r.day));
      const today = new Date();
      for (let k = 0; k < SALVAGE_DAYS; k++) {
        days.add(dayStamp(new Date(today.getFullYear(), today.getMonth(), today.getDate() - k)));
      }
      for (const day of days) {
        const rows = await tryAll<{ day: string; package: string; minutes: number }>(
          'SELECT day, package, minutes FROM usage_day WHERE day = ?',
          day
        );
        if (rows) usage.push(...rows);
      }
    }
    const unlocks = (await tryAll<{ day: string; count: number }>('SELECT day, count FROM unlock_day')) ?? [];

    await db.withTransactionAsync(async () => {
      for (const r of observed) await db.runAsync('INSERT OR IGNORE INTO observed_day (day) VALUES (?)', r.day);
      for (const r of usage ?? []) {
        if (!Number.isFinite(r.minutes)) continue;
        await db.runAsync(
          'INSERT OR IGNORE INTO usage_day (day, package, minutes) VALUES (?, ?, ?)',
          r.day,
          r.package,
          r.minutes
        );
        await db.runAsync('INSERT OR IGNORE INTO observed_day (day) VALUES (?)', r.day);
      }
      for (const r of unlocks) {
        if (Number.isInteger(r.count)) {
          await db.runAsync('INSERT OR IGNORE INTO unlock_day (day, count) VALUES (?, ?)', r.day, r.count);
        }
      }
    });
  } catch {
    // Nothing to rescue, or nothing readable. Start from what Android still has.
  } finally {
    try {
      await old?.closeAsync();
    } catch {
      // Already unusable.
    }
  }
  try {
    await SQLite.deleteDatabaseAsync(V1_NAME);
  } catch {
    // Left behind if it can't be deleted; it is never opened again.
  }
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'salvagedV1', '1');
}

export interface DayTotals {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Package name -> minutes. */
  totals: Record<string, number>;
}

/**
 * Record one day's per-app totals, replacing whatever was stored for that day.
 *
 * Idempotent by (day, package), so this is safe to call repeatedly through the
 * day as today's numbers grow.
 */
export async function recordDay({ day, totals }: DayTotals): Promise<void> {
  return serialize(async () => {
    const db = await open();
    const entries = Object.entries(totals).filter(([, m]) => Number.isFinite(m) && m > 0);

    await db.withTransactionAsync(async () => {
      // The day was looked at either way.
      await db.runAsync('INSERT OR IGNORE INTO observed_day (day) VALUES (?)', day);

      // Nothing to write: leave whatever is already stored alone.
      //
      // This is the whole point of the table. The OS keeps roughly ten days and
      // then forgets; the rollup exists to remember what it forgets. Replacing a
      // day with an empty result - which is what the OS returns for any day it
      // has aged out - would delete exactly the history this table was built to
      // preserve, on every single launch.
      if (entries.length === 0) return;

      // With data in hand, replace the day so an app that fell out of use drops
      // out rather than keeping its last-written value forever.
      await db.runAsync('DELETE FROM usage_day WHERE day = ?', day);
      const stmt = await db.prepareAsync('INSERT INTO usage_day (day, package, minutes) VALUES ($day, $pkg, $min)');
      try {
        for (const [pkg, minutes] of entries) {
          await stmt.executeAsync({ $day: day, $pkg: pkg, $min: minutes });
        }
      } finally {
        await stmt.finalizeAsync();
      }
    });
  });
}

/**
 * Record unlock counts per day (day stamp -> count).
 *
 * A stored count is only ever raised. Today's count grows all day, and a day
 * the OS has partly or wholly forgotten comes back lower or empty - the same
 * hazard recordDay guards against - so the larger number is always the truer
 * one. Days with no unlocks aren't written: an absent day reads as zero.
 */
export async function recordUnlocks(counts: Record<string, number>): Promise<void> {
  const entries = Object.entries(counts).filter(([, n]) => Number.isInteger(n) && n > 0);
  if (entries.length === 0) return;
  return serialize(async () => {
    const db = await open();
    await db.withTransactionAsync(async () => {
      for (const [day, count] of entries) {
        await db.runAsync(
          'INSERT INTO unlock_day (day, count) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET count = MAX(count, excluded.count)',
          day,
          count
        );
      }
    });
  });
}

/** Unlocks per recorded day in [fromDay, toDay], keyed by day. */
export async function readUnlocks(fromDay: string, toDay: string): Promise<Record<string, number>> {
  return serialize(async () => {
    const db = await open();
    const rows = await db.getAllAsync<{ day: string; count: number }>(
      'SELECT day, count FROM unlock_day WHERE day >= ? AND day <= ?',
      fromDay,
      toDay
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.day] = r.count;
    return out;
  });
}

/** Forget a day entirely - both its usage and the record that it was observed.
 *  Only for deliberate resets; the normal path never deletes history. */
export async function forgetDay(day: string): Promise<void> {
  return serialize(async () => {
    const db = await open();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM usage_day WHERE day = ?', day);
      await db.runAsync('DELETE FROM observed_day WHERE day = ?', day);
    });
  });
}

/** Per-app minutes for one day, or an empty object if that day is not recorded. */
export async function readDay(day: string): Promise<Record<string, number>> {
  return serialize(async () => {
    const db = await open();
    const rows = await db.getAllAsync<{ package: string; minutes: number }>(
      'SELECT package, minutes FROM usage_day WHERE day = ?',
      day
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.package] = r.minutes;
    return out;
  });
}

/** Per-app minutes for every recorded day in [fromDay, toDay], keyed by day. */
export async function readRange(fromDay: string, toDay: string): Promise<Record<string, Record<string, number>>> {
  return serialize(async () => {
    const db = await open();
    const rows = await db.getAllAsync<{ day: string; package: string; minutes: number }>(
      'SELECT day, package, minutes FROM usage_day WHERE day >= ? AND day <= ? ORDER BY day',
      fromDay,
      toDay
    );
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      (out[r.day] ??= {})[r.package] = r.minutes;
    }
    return out;
  });
}

/** Totals per app across a day range, aggregated by SQLite rather than in JS. */
export async function sumByPackage(fromDay: string, toDay: string): Promise<Record<string, number>> {
  return serialize(async () => {
    const db = await open();
    const rows = await db.getAllAsync<{ package: string; total: number }>(
      'SELECT package, SUM(minutes) AS total FROM usage_day WHERE day >= ? AND day <= ? GROUP BY package',
      fromDay,
      toDay
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.package] = r.total;
    return out;
  });
}

export interface HistoryCoverage {
  /** Number of distinct days with any recorded data. */
  days: number;
  /** Oldest and newest recorded day, or null when empty. */
  oldest: string | null;
  newest: string | null;
}

/**
 * How much real history exists. This is what gates the Month and Year views:
 * they stay hidden until there are genuinely enough days to draw, rather than
 * rendering a chart that is mostly blank.
 */
export async function coverage(): Promise<HistoryCoverage> {
  return serialize(async () => {
    const db = await open();
    // Counted from observed_day: a day we checked and found quiet is real
    // history, and should advance the Month/Year coverage just like a busy one.
    const row = await db.getFirstAsync<{ days: number; oldest: string | null; newest: string | null }>(
      'SELECT COUNT(*) AS days, MIN(day) AS oldest, MAX(day) AS newest FROM observed_day'
    );
    return { days: row?.days ?? 0, oldest: row?.oldest ?? null, newest: row?.newest ?? null };
  });
}

/** Days already recorded, as a set, so a backfill can skip them. */
export async function recordedDays(): Promise<Set<string>> {
  return serialize(async () => {
    const db = await open();
    const rows = await db.getAllAsync<{ day: string }>('SELECT day FROM observed_day ORDER BY day');
    return new Set(rows.map((r) => r.day));
  });
}

/**
 * Drop days older than `keepDays` from today.
 *
 * History is the point of this table, so retention is generous - but unbounded
 * growth on a phone is not acceptable either. At ~109 apps a day, 400 days is a
 * few MB.
 */
export async function prune(keepDays = 400): Promise<number> {
  return serialize(async () => {
    const db = await open();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keepDays);
    const stamp = dayStamp(cutoff);
    const result = await db.runAsync('DELETE FROM usage_day WHERE day < ?', stamp);
    await db.runAsync('DELETE FROM observed_day WHERE day < ?', stamp);
    await db.runAsync('DELETE FROM unlock_day WHERE day < ?', stamp);
    return result.changes;
  });
}

/** Testing helper: forget the cached handle so a fresh database can be opened. */
export function resetForTests(): void {
  dbPromise = null;
}
