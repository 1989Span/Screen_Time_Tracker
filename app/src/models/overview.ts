// Overview cards and the breakdown (detail) screen.

import { useMemo } from 'react';
import {
  CATS,
  CCOL,
  DATES,
  N_DAYS,
  RANGE_LABEL,
  RangeId,
  dayUsage,
  factFor,
  fmt,
  fmtShort,
  fourteenDayAvg,
  limLabel,
  prevTotal,
  slice,
} from '../data';
import { useNavStore } from '../state/navStore';
import { usePrefsStore, trackedFlags } from '../state/prefsStore';
import { useTimersStore } from '../state/timersStore';
import { useDetailStore } from '../state/detailStore';
import { CategoryRow, Segment, limitState } from './shared';

const RANGE_IDS: RangeId[] = ['day', 'week', 'month', 'year'];
const PREV_NAME: Record<RangeId, string> = { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' };
const AXIS_NOTE: Record<RangeId, string> = { day: 'By hour', week: 'By day', month: 'By day', year: 'By month' };

export interface OverviewCard {
  id: RangeId;
  label: string;
  dates: string;
  total: string;
  fact: string;
  avg: string;
  more: string;
  top: CategoryRow[];
  comp: Segment[];
  onPress: () => void;
}

export interface OverviewViewModel {
  cards: OverviewCard[];
}

export function useOverviewModel(): OverviewViewModel {
  const tracked = usePrefsStore((s) => s.tracked);
  const openRange = useDetailStore((s) => s.openRange);

  return useMemo(() => {
    const flags = trackedFlags(tracked);
    return {
      cards: RANGE_IDS.map((id) => {
        const sl = slice(id, null, flags);
        return {
          id,
          label: RANGE_LABEL[id],
          dates: DATES[id],
          total: fmt(sl.total),
          fact: factFor(id, sl.total),
          avg: id === 'day' ? 'so far today' : fmtShort(sl.total / N_DAYS[id]) + '/day',
          more: sl.rows.length > 3 ? '+' + (sl.rows.length - 3) + ' more' : '',
          top: sl.rows.slice(0, 3),
          comp: sl.order.map((ci) => ({ w: (sl.scoped[ci] / Math.max(1, sl.total)) * 100, color: CCOL[ci] })),
          onPress: () => openRange(id),
        };
      }),
    };
  }, [tracked, openRange]);
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
  const tracked = usePrefsStore((s) => s.tracked);
  const range = useDetailStore((s) => s.range);
  const selected = useDetailStore((s) => s.selected);
  const setRange = useDetailStore((s) => s.setRange);
  const toggleBucket = useDetailStore((s) => s.toggleBucket);
  const limits = useTimersStore((s) => s.limits);
  const openTimer = useTimersStore((s) => s.open);
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const flags = trackedFlags(tracked);
    const m = slice(range, selected, flags);
    const previous = prevTotal(range, flags);
    const diff = m.total - previous;
    const pct = Math.round((Math.abs(diff) / Math.max(1, previous)) * 100);
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
      scope: m.sel != null ? m.bk[m.sel].label : DATES[range],
      total: fmt(m.total),
      avg: fmtShort(m.total / (m.sel != null ? 1 : N_DAYS[range])),
      avgLabel: m.sel != null ? 'in this slice' : 'daily average',
      delta:
        m.sel != null
          ? 'Tap the bar again to clear'
          : Math.abs(diff) < 1
            ? 'Same as ' + PREV_NAME[range]
            : (diff > 0 ? '↑ ' : '↓ ') + pct + '% vs ' + PREV_NAME[range],
      deltaPositive: diff > 0,
      deltaNeutral: m.sel != null,
      comp: m.order.map((ci) => ({ w: (m.scoped[ci] / Math.max(1, m.total)) * 100, color: CCOL[ci] })),
      stacks: m.bk.map((b, i) => {
        const segs = m.order
          .map((ci) => ({ h: Math.max(0, (b.per[ci] / m.max) * 164), color: CCOL[ci] }))
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
        const s = limitState(r.ci, limits, todayPer);
        return {
          ...r,
          limChip: s.limit == null ? 'Set limit' : limLabel(s.limit) + '/day',
          limBg: s.limit == null ? 'rgba(29,31,32,0.06)' : s.bg,
          limFg: s.limit == null ? 'rgba(29,31,32,0.50)' : s.fg,
          onPress: () => openTimer(r.ci),
        };
      }),
      axisNote: AXIS_NOTE[range],
      count: m.rows.length + ' categories',
      gap: range === 'month' ? 2 : range === 'day' ? 3 : 7,
      goOverview: () => go('ov'),
    };
  }, [tracked, range, selected, limits, setRange, toggleBucket, openTimer, go]);
}

export interface CategoryToggle {
  id: string;
  name: string;
  avg: string;
  color: string;
  on: boolean;
  onPress: () => void;
}

export interface CategoriesViewModel {
  rows: CategoryToggle[];
  allLabel: string;
  toggleAll: () => void;
}

export function useCategoriesModel(): CategoriesViewModel {
  const tracked = usePrefsStore((s) => s.tracked);
  const toggle = usePrefsStore((s) => s.toggle);
  const toggleAll = usePrefsStore((s) => s.toggleAll);

  return useMemo(
    () => ({
      rows: CATS.map((c, i) => ({
        id: c.id,
        name: c.name,
        avg: fmtShort(fourteenDayAvg(i)) + '/day',
        color: CCOL[i],
        on: tracked.indexOf(c.id) >= 0,
        onPress: () => toggle(c.id),
      })),
      allLabel: tracked.length === CATS.length ? 'Clear all' : 'Select all',
      toggleAll,
    }),
    [tracked, toggle, toggleAll]
  );
}
