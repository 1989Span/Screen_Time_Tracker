// Chooses which usage source the app reads from, and is the only place that
// decision is made.
//
// usageSource() throws when nothing is installed rather than quietly falling
// back to the demo generator. That is deliberate: a release build silently
// showing generated numbers as if they were the user's real screen time would
// be a far worse failure than a loud one at startup.
//
// Phase 3 extends this to try the Android UsageStats source first and fall back
// to demo only when the platform cannot provide data or the user has not granted
// access - and in that case the UI must say so, not pretend.

import { demoSource } from './demoSource';
import { setUsageSource } from './source';

/** Longest span any screen asks for (the year card). */
export const MAX_DAYS_NEEDED = 366;

export function installDefaultUsageSource(): void {
  setUsageSource(demoSource);
  // Demo loading is synchronous arithmetic, so this resolves immediately; the
  // call exists so the startup path is already shaped for a source that awaits.
  void demoSource.load(MAX_DAYS_NEEDED);
}
