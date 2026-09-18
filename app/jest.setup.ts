// Tests must never depend on the wall clock. Pin every suite to the instant the
// demo dataset was designed around — 25 Aug 2026, 19:00 local — which is the
// `TODAY`/`CUR_HOUR` pair the data layer used to hardcode. Assertions about
// generated usage, dates and the penalty ledger stay stable because of this.
import { setFixedClock } from './src/clock';

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
