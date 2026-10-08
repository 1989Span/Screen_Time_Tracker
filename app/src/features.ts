// Feature flags.
//
// Flags here hide unfinished work from the UI without deleting it, so the code
// stays under test and under review rather than rotting on a branch. Flip a flag
// back to `true` and the feature returns exactly as it was.

/**
 * The penalty limit: a daily budget, set per month, that adds a paper-money
 * charge for every minute over (penaltyPlan.ts). No money moves: the app keeps
 * the tally. This controls whether the card is rendered on the Overview, the
 * sole entry point to the penalty and charge-history screens, and whether its
 * monthly reminders are scheduled.
 */
export const PENALTY_LIMIT_ENABLED = true;

/**
 * Groups: compare screen time with friends and vote on what counts.
 *
 * Works without a server. Members swap links (groupLink.ts) that carry their
 * daily numbers, sent through whatever messaging app they like. It was hidden
 * while it depended on a contacts source and a backend it never had.
 */
export const GROUPS_ENABLED = true;

const PENALTY_VIEWS = ['penalty', 'history'];
const GROUP_VIEWS = ['groups', 'groupSettings', 'groupRules', 'groupChallenge', 'groupJoin', 'newGroup'];

/** Views that only exist when a flag is on. Routing falls back to Overview for
 *  these while the flag is off, so nothing can strand the user on an orphan
 *  screen that has no way back. A tab whose root view is listed here is not
 *  rendered at all. */
export const DISABLED_VIEWS: readonly string[] = [
  ...(PENALTY_LIMIT_ENABLED ? [] : PENALTY_VIEWS),
  ...(GROUPS_ENABLED ? [] : GROUP_VIEWS),
];
