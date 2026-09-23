// Feature flags.
//
// Flags here hide unfinished work from the UI without deleting it, so the code
// stays under test and under review rather than rotting on a branch. Flip a flag
// back to `true` and the feature returns exactly as it was.

/**
 * The penalty limit: a daily budget that accrues a notional charge for every
 * minute over, settling into a locked balance.
 *
 * Off while the rest of the app is being tested on real data. The ledger logic,
 * its screens and its tests all remain — this only controls whether the card is
 * rendered on the Overview, which is the sole entry point to the penalty and
 * charge-history screens.
 *
 * Still to settle before turning it on: no money actually moves, and the "locked
 * balance" framing implies a custody model the app has no backend for.
 */
export const PENALTY_LIMIT_ENABLED = false;

/** Views that only exist when a flag is on. Routing falls back to Overview for
 *  these while the flag is off, so nothing can strand the user on an orphan
 *  screen that has no way back. */
export const DISABLED_VIEWS: readonly string[] = PENALTY_LIMIT_ENABLED ? [] : ['penalty', 'history'];
