// Tests must never depend on the wall clock. Pin every suite to the instant the
// demo dataset was designed around — 25 Aug 2026, 19:00 local — which is the
// `TODAY`/`CUR_HOUR` pair the data layer used to hardcode. Assertions about
// generated usage, dates and the penalty ledger stay stable because of this.
import { setFixedClock } from './src/clock';

setFixedClock(new Date(2026, 7, 25, 19, 0, 0));
