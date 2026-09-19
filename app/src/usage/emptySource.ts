// A source that reports nothing.
//
// The data layer throws if asked for numbers with no source installed, so
// something has to be in place before the first render. That used to be a
// generated demo dataset, which meant a moment where fabricated numbers were on
// screen - and on a platform without usage access, it was what stayed there.
//
// This reports honestly instead: no series, no usage, status 'unavailable'. Every
// chart renders empty, which is what "we have no data" should look like.

import { Cat } from './categories';
import { Series } from './series';
import { SourceStatus, UsageSource } from './source';

export class EmptyUsageSource implements UsageSource {
  readonly id = 'empty';
  readonly status: SourceStatus = 'unavailable';

  series(): Series[] {
    return [];
  }

  categories(): Cat[] {
    return [];
  }

  async load(): Promise<void> {
    // Nothing to load.
  }

  invalidate(): void {
    // Nothing cached.
  }

  dayTotals(): number[] {
    return [];
  }

  hourTotals(): number[] {
    return [];
  }
}

export const emptySource = new EmptyUsageSource();
