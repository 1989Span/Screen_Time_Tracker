// The seam between the UI and wherever usage numbers come from.
//
// Everything the app displays - the overview cards, the breakdown chart, the
// timers, the penalty ledger - is derived arithmetic over just two primitives:
// per-category minutes for a day, and for one hour of a day. A source supplies
// those two; `data.ts` owns every derivation above them and does not care which
// source it is talking to.
//
// Why the reads are synchronous
// ----------------------------
// Android's UsageStatsManager is a JNI call and therefore async, while the view
// models call slice() synchronously inside useMemo. Rather than make every view
// model async - which would mean loading states threaded through screens that
// have no other reason to be async - a source loads into an in-memory cache via
// load(), and the reads below serve that cache. That matches how screen-time
// data actually behaves: you sample it periodically, it is not a live stream.
//
// Consequence: reads before load() resolves are served from whatever the source
// has, so callers should gate the first paint on status === 'ready'.

import { Cat } from './categories';

export type SourceStatus =
  | 'idle' // constructed, load() not called yet
  | 'loading' // load() in flight
  | 'ready' // cache warm, reads are meaningful
  | 'denied' // the OS refused us the data (permission not granted)
  | 'unavailable'; // no such capability on this platform/OS version

export interface UsageSource {
  /** Stable identifier, for logs and for asserting which source is installed. */
  readonly id: string;

  /** Categories this source can report. The demo source has a fixed list; a
   *  real one derives them from the apps actually installed and used. */
  categories(): Cat[];

  readonly status: SourceStatus;

  /** Warm the cache for `days` days back from today, inclusive of today.
   *  Idempotent and safe to call again to refresh. */
  load(days: number): Promise<void>;

  /** Per-category minutes for the whole of the day `idx` days before today.
   *  `idx === 0` means today so far, not a projected full day. */
  dayTotals(idx: number): number[];

  /** Per-category minutes within hour `h` (0-23) of the day `idx` days back.
   *  Hours later than the current hour of today must read zero. */
  hourTotals(idx: number, h: number): number[];

  /** Drop cached data. Called when the calendar day rolls over, since every
   *  index above is relative to "today" and so changes meaning at midnight. */
  invalidate(): void;
}

let installed: UsageSource | null = null;

/** The source the app is reading from. */
export function usageSource(): UsageSource {
  if (!installed) throw new Error('No usage source installed - call setUsageSource() during startup.');
  return installed;
}

/** Install a source. Called once at startup, and by tests. */
export function setUsageSource(source: UsageSource): void {
  installed = source;
}

export function hasUsageSource(): boolean {
  return installed !== null;
}
