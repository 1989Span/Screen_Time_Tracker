// A "series" is one thing measured and charted: one bar colour, one row in the
// breakdown, one timer.
//
// It used to be hardwired to the eight demo categories. With real data the unit
// is an installed app, and there can be a hundred of them, so the count is
// dynamic and the source decides what the series are. Everything downstream -
// ranges, buckets, totals, stacks - only ever needed "N things indexed 0..N-1",
// which is why this generalises without touching the derivation arithmetic.

export interface Series {
  /** Stable identity. A category id for demo data, a package name for real. */
  id: string;
  /** What the user sees. */
  name: string;
  /** Chart colour. Fixed palette for demo categories, generated for apps. */
  color: string;
  /**
   * Android's ApplicationInfo.category, or -1 when undeclared.
   *
   * Carried only so group views can aggregate, never shown in the user's own
   * screens. Worth knowing it is unreliable: on the first device measured, 47%
   * of launchable apps reported -1 and a third of the rest claimed
   * PRODUCTIVITY, which is why tracking is per app rather than per category.
   */
  androidCategory?: number;
}

/** How many series a stacked chart breaks out before grouping the remainder. */
export const CHART_SERIES_LIMIT = 8;

/** Id of the synthetic series holding everything past CHART_SERIES_LIMIT. */
export const OTHER_SERIES_ID = '__other__';

/**
 * Deterministic colour for an arbitrary id.
 *
 * Real app lists are dynamic, so colours cannot come from a hand-picked palette
 * the way eight fixed categories could. Hashing the id keeps an app the same
 * colour between launches (a chart whose colours shuffle on every open is
 * unreadable) while spreading hues widely enough to tell adjacent bands apart.
 * Saturation and lightness stay in a narrow band so nothing clashes with the
 * app's own palette or washes out against the light background.
 */
export function colorForId(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Golden-angle stepping spreads sequential hashes around the wheel instead of
  // clustering them.
  const hue = ((h >>> 0) * 137.508) % 360;
  const sat = 42 + ((h >>> 8) & 0x0f); // 42-57%
  const light = 44 + ((h >>> 16) & 0x0b); // 44-55%
  return `hsl(${hue.toFixed(1)}, ${sat}%, ${light}%)`;
}
