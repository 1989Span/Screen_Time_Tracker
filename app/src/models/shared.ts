// Pieces shared by more than one view model.

import { CATS, limLabel } from '../data';

export interface Segment {
  w: number; // percent of the bar
  color: string;
}

export interface CategoryRow {
  name: string;
  time: string;
  pct: number;
  share: string;
  ci: number;
  tone: string;
}

export interface StateChip {
  text: string;
  bg: string;
  fg: string;
}

export const CHIP_OFF: StateChip = { text: 'Off', bg: 'rgba(29,31,32,0.07)', fg: 'rgba(29,31,32,0.52)' };
export const OVER_BG = 'rgba(181,87,107,0.15)';
export const OVER_FG = '#8e3f52';
export const UNDER_BG = 'rgba(79,140,123,0.15)';
export const UNDER_FG = '#2f6355';
export const OVER_BAR = '#b5576b';

/** A category's daily timer state: how much is left, and the chip colours. */
export function limitState(catIndex: number, limits: Record<string, number>, todayPer: number[]) {
  const limit = limits[CATS[catIndex].id];
  const used = todayPer[catIndex];
  const over = limit != null && used >= limit;
  return {
    limit,
    used,
    over,
    text: limit == null ? 'No limit' : over ? 'Limit reached' : limLabel(Math.round(limit - used)) + ' left',
    bg: limit == null ? CHIP_OFF.bg : over ? OVER_BG : UNDER_BG,
    fg: limit == null ? CHIP_OFF.fg : over ? OVER_FG : UNDER_FG,
  };
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + suffix;
}

/** Competition ranking over a sorted list: equal values share a rank (1, 1, 3). */
export function ranks(sorted: number[]): number[] {
  const out: number[] = [];
  sorted.forEach((v, i) => out.push(i > 0 && v === sorted[i - 1] ? out[i - 1] : i + 1));
  return out;
}
