// Tests must never depend on the wall clock. Pin every suite to the instant the
// demo dataset was designed around — 25 Aug 2026, 19:00 local — which is the
// `TODAY`/`CUR_HOUR` pair the data layer used to hardcode. Assertions about
// generated usage, dates and the penalty ledger stay stable because of this.
import { setFixedClock } from './src/clock';
import { installDefaultUsageSource } from './src/usage/bootstrap';

setFixedClock(new Date(2026, 7, 25, 19, 0, 0));

// AsyncStorage is a native module, so it has no implementation under jest. The
// package ships an in-memory mock for exactly this; persisted stores then
// exercise their real merge/partialize logic against it.
jest.mock('@react-native-async-storage/async-storage', () =>
  // require() is required here, not stylistic: jest.mock factories are hoisted
  // above imports, so an ESM import of the mock would not be initialised yet.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// The data layer reads through an installed usage source, so tests need one.
installDefaultUsageSource();

// The usage-stats native module has no implementation under jest. Default to
// "no permission, nothing installed", which is the honest shape for a test
// environment; individual tests override with jest.spyOn where they need data.
jest.mock('./modules/usage-stats', () => ({
  UsageStats: {
    hasPermission: () => false,
    openSettings: () => {},
    installedApps: async () => [],
    queryTotals: async () => ({}),
    queryEvents: async () => [],
    probeRetention: async () => ({}),
  },
}));

// expo-sqlite is native and does not resolve under jest. Stubbed so modules that
// import it can be unit-tested; the SQL itself is verified on a device, not
// against a hand-written fake SQL engine that would prove nothing about SQLite.
// expo-sqlite is native and does not resolve under jest. This stub records every
// statement so tests can assert on *which* SQL ran - which is how the rollup's
// "never delete on an empty result" rule is protected from regressing. The real
// SQL is still verified on a device; this guards the control flow around it.
const sqlLog: string[] = [];
(globalThis as unknown as { __sqlLog: string[] }).__sqlLog = sqlLog;

jest.mock('expo-sqlite', () => {
  // Resolved on each call, not captured once: jest.mock factories are hoisted
  // above the assignment above, so a value captured here would be undefined.
  const g = globalThis as unknown as { __sqlLog?: string[] };
  const log = () => (g.__sqlLog ??= []);
  const statement = {
    executeAsync: async (...args: unknown[]) => {
      log().push('EXEC ' + JSON.stringify(args));
      return {};
    },
    finalizeAsync: async () => {},
  };
  const db = {
    execAsync: async (sql: string) => {
      log().push(sql);
    },
    runAsync: async (sql: string) => {
      log().push(sql);
      return { changes: 0, lastInsertRowId: 0 };
    },
    getFirstAsync: async (sql: string) => {
      log().push(sql);
      return undefined;
    },
    getAllAsync: async (sql: string) => {
      log().push(sql);
      return [];
    },
    prepareAsync: async (sql: string) => {
      log().push('PREPARE ' + sql);
      return statement;
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      await fn();
    },
    closeAsync: async () => {},
  };
  return {
    openDatabaseAsync: async () => db,
    openDatabaseSync: () => db,
  };
});
