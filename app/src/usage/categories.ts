// The category taxonomy the whole app is modelled on.
//
// `base` and `peak` are demo-generator inputs, not product data: the average
// minutes a day a category gets, and the hour it peaks at. A real source maps
// installed packages onto these ids and ignores both fields - which is why they
// are optional from the app's point of view and only the demo source reads them.

export interface Cat {
  id: string;
  name: string;
  /** Demo generator: average minutes a day. Unused by real sources. */
  base: number;
  /** Demo generator: hour of day this category peaks at. Unused by real sources. */
  peak: number;
  /** Treated as work, so it inverts the weekday/weekend shape. */
  work?: boolean;
}

export const CATS: Cat[] = [
  { id: 'social', name: 'Social', base: 96, peak: 21 },
  { id: 'video', name: 'Video', base: 74, peak: 22 },
  { id: 'work', name: 'Work', base: 118, peak: 11, work: true },
  { id: 'messaging', name: 'Messaging', base: 52, peak: 13 },
  { id: 'games', name: 'Games', base: 34, peak: 20 },
  { id: 'music', name: 'Music', base: 38, peak: 9 },
  { id: 'reading', name: 'Reading', base: 22, peak: 23 },
  { id: 'navigation', name: 'Navigation', base: 16, peak: 8 },
];

export const CAT_INDEX: Record<string, number> = Object.fromEntries(CATS.map((c, i) => [c.id, i]));
