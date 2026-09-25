// Overview cards and the breakdown (detail) screen.

import { useMemo } from 'react';
import {
  CATS,
  dates,
  N_DAYS,
  RANGE_LABEL,
  RangeId,
  dayUsage,
  factFor,
  fmt,
  fmtShort,
  limLabel,
  prevTotal,
  series,
  slice,
} from '../data';
import { useAppsStore } from '../state/appsStore';
import { rangeAvailability } from '../usage/rangeAvailability';
import { useNavStore } from '../state/navStore';
import { useTimersStore } from '../state/timersStore';
import { useDetailStore } from '../state/detailStore';
import { CategoryRow, OVER_BAR, Segment, limitState } from './shared';

// Bars and segments are coloured from the series itself. CCOL is a fixed
// 8-entry palette in CATS order: indexing it by a series index gave the wrong
// colour for the first eight apps and undefined for every one after them.
const tone = (list: ReturnType<typeof series>, ci: number) => list[ci]?.color ?? OVER_BAR;

const RANGE_IDS: RangeId[] = ['day', 'week', 'month', 'year'];
const PREV_NAME: Record<RangeId, string> = {
  day: 'yesterday',
  week: 'last week',
  month: 'last month',
  year: 'last year',
};
const AXIS_NOTE: Record<RangeId, string> = { day: 'By hour', week: 'By day', month: 'By day', year: 'By month' };

export interface Change {
  text: string;
  positive: boolean;
  neutral: boolean;
}

/**
 * "--%", as shown when there is nothing to compare with. A hair space (U+200A)
 * sits between the dashes because Barlow's hyphens have no side bearings: typed
 * as "--" they touch and render as one long dash. A wider space reads as "- -%".
 */
export const NO_COMPARISON = '-\u200A-%';

/**
 * How `total` compares with the same span before it, as the breakdown's chip.
 *
 * Only calculated when the previous span has usage to compare against: at
 * least a minute once rounded, the smallest amount the app displays. With
 * nothing there a percentage means nothing. The old divisor floor of 1 minute
 * turned an empty previous month into "↑ 252232% vs last month", so it now
 * reads "--%" instead.
 */
export function changeVsPrevious(total: number, previous: number, prevName: string): Change {
  if (Math.round(previous) < 1) return { text: NO_COMPARISON + ' vs ' + prevName, positive: false, neutral: true };
  const diff = total - previous;
  if (Math.abs(diff) < 1) return { text: 'Same as ' + prevName, positive: diff > 0, neutral: false };
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  return { text: (diff > 0 ? '↑ ' : '↓ ') + pct + '% vs ' + prevName, positive: diff > 0, neutral: false };
}

export interface OverviewCard {
  id: RangeId;
  label: string;
  dates: string;
  total: string;
  fact: string;
  avg: string;
  more: string;
  /** Null when the range is fully covered; otherwise how partial it is, so a
   *  month-to-date chart cannot be mistaken for a whole month. */
  coverageNote: string | null;
  top: CategoryRow[];
  comp: Segment[];
  onPress: () => void;
}

export interface OverviewViewModel {
  cards: OverviewCard[];
}

export function useOverviewModel(): OverviewViewModel {
  // Usage arrives asynchronously; without this the memo keeps its empty values.
  const dataVersion = useAppsStore((s) => s.dataVersion);
  const historyDays = useAppsStore((s) => s.historyDays);
  const openRange = useDetailStore((s) => s.openRange);

  return useMemo(() => {
    const label = dates();
    const seriesList = series();
    const coverage = rangeAvailability(historyDays);
    return {
      cards: RANGE_IDS.map((id) => {
        const sl = slice(id, null);
        return {
          id,
          label: RANGE_LABEL[id],
          dates: label[id],
          total: fmt(sl.total),
          fact: factFor(id, sl.total),
          avg: id === 'day' ? 'so far today' : fmtShort(sl.total / N_DAYS[id]) + '/day',
          more: sl.rows.length > 3 ? '+' + (sl.rows.length - 3) + ' more' : '',
          coverageNote: coverage[id].note,
          top: sl.rows.slice(0, 3),
          comp: sl.order.map((ci) => ({
            w: (sl.scoped[ci] / Math.max(1, sl.total)) * 100,
            color: tone(seriesList, ci),
          })),
          onPress: () => openRange(id),
        };
      }),
    };
  }, [openRange, dataVersion, historyDays]);
}

export interface RangeTab {
  id: RangeId;
  label: string;
  active: boolean;
  onPress: () => void;
}

export interface StackBar {
  segs: { h: number; color: string; topRadius: boolean }[];
  tick: string;
  dim: boolean;
  active: boolean;
  onPress: () => void;
}

export interface DetailRow extends CategoryRow {
  limChip: string;
  limBg: string;
  limFg: string;
  onPress: () => void;
}

export interface DetailViewModel {
  range: RangeId;
  ranges: RangeTab[];
  fact: string;
  scope: string;
  total: string;
  avg: string;
  avgLabel: string;
  delta: string;
  deltaPositive: boolean;
  deltaNeutral: boolean;
  comp: Segment[];
  stacks: StackBar[];
  rows: DetailRow[];
  axisNote: string;
  count: string;
  gap: number;
  goOverview: () => void;
}

export function useDetailModel(): DetailViewModel {
  const dataVersion = useAppsStore((s) => s.dataVersion);
  const range = useDetailStore((s) => s.range);
  const selected = useDetailStore((s) => s.selected);
  const setRange = useDetailStore((s) => s.setRange);
  const toggleBucket = useDetailStore((s) => s.toggleBucket);
  const limits = useTimersStore((s) => s.limits);
  const openTimer = useTimersStore((s) => s.open);
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const label = dates();
    const seriesList = series();
    const m = slice(range, selected);
    const change = changeVsPrevious(m.total, prevTotal(range), PREV_NAME[range]);
    const todayPer = dayUsage();

    return {
      range,
      ranges: RANGE_IDS.map((id) => ({
        id,
        label: RANGE_LABEL[id],
        active: range === id,
        onPress: () => setRange(id),
      })),
      fact: factFor(range, m.total),
      scope: m.sel != null ? m.bk[m.sel].label : label[range],
      total: fmt(m.total),
      avg: fmtShort(m.total / (m.sel != null ? 1 : N_DAYS[range])),
      avgLabel: m.sel != null ? 'in this slice' : 'daily average',
      delta: m.sel != null ? 'Tap the bar again to clear' : change.text,
      deltaPositive: change.positive,
      deltaNeutral: m.sel != null || change.neutral,
      comp: m.order.map((ci) => ({ w: (m.scoped[ci] / Math.max(1, m.total)) * 100, color: tone(seriesList, ci) })),
      stacks: m.bk.map((b, i) => {
        const segs = m.order
          .map((ci) => ({ h: Math.max(0, (b.per[ci] / m.max) * 164), color: tone(seriesList, ci) }))
          .filter((s) => s.h > 0.6)
          .reverse();
        return {
          segs: segs.map((s, k) => ({ ...s, topRadius: k === 0 })),
          tick: m.bk.length > 12 && i % 5 !== 0 && i !== m.bk.length - 1 ? '' : b.tick,
          dim: !(m.sel == null || m.sel === i),
          active: m.sel === i,
          onPress: () => toggleBucket(i),
        };
      }),
      rows: m.rows.map((r) => {
        // r.ci indexes the series; the timer is keyed by that series' id.
        const id = seriesList[r.ci]?.id ?? '';
        const s = limitState(id, r.ci, limits, todayPer);
        return {
          ...r,
          limChip: s.limit == null ? 'Set limit' : limLabel(s.limit) + '/day',
          limBg: s.limit == null ? 'rgba(29,31,32,0.06)' : s.bg,
          limFg: s.limit == null ? 'rgba(29,31,32,0.50)' : s.fg,
          onPress: () => openTimer(id),
        };
      }),
      axisNote: AXIS_NOTE[range],
      count: m.rows.length + (m.rows.length === 1 ? ' app' : ' apps'),
      gap: range === 'month' ? 2 : range === 'day' ? 3 : 7,
      goOverview: () => go('ov'),
    };
  }, [range, selected, limits, setRange, toggleBucket, openTimer, go, dataVersion]);
}
