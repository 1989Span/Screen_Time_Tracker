// View-model layer — mirrors the "turn 3" (m_*) branch of renderVals() in
// the original .dc.html, restricted to the final modern-pass screens:
// overview -> detail (breakdown) -> app timers list -> timer editor,
// plus the shared tracked-categories picker.

import { useMemo, useState } from 'react';
import {
  CATS,
  CCOL,
  DATES,
  N_DAYS,
  PRESETS,
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
} from './data';

export type View = 'ov' | 'detail' | 'pick' | 'limits' | 'limit';

interface AppState {
  v3: View;
  r3: RangeId;
  sel3: number | null;
  tracked: string[];
  limits: Record<string, number>;
  limitCat: number | null;
}

const RANGE_IDS: RangeId[] = ['day', 'week', 'month', 'year'];
const PREV_NAME: Record<RangeId, string> = { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' };

function limState(li: number, limits: Record<string, number>, todayPer: number[]) {
  const lim = limits[CATS[li].id];
  const used = todayPer[li];
  const over = lim != null && used >= lim;
  return {
    lim,
    used,
    over,
    text: lim == null ? 'No limit' : over ? 'Limit reached' : limLabel(Math.round(lim - used)) + ' left',
    bg: lim == null ? 'rgba(29,31,32,0.07)' : over ? 'rgba(181,87,107,0.15)' : 'rgba(79,140,123,0.15)',
    fg: lim == null ? 'rgba(29,31,32,0.52)' : over ? '#8e3f52' : '#2f6355',
  };
}

export function useScreenTimeModel() {
  const [state, setState] = useState<AppState>({
    v3: 'ov',
    r3: 'week',
    sel3: null,
    tracked: CATS.map((c) => c.id),
    limits: {},
    limitCat: null,
  });

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }));

  return useMemo(() => {
    const st = state;
    const tr = CATS.map((c) => st.tracked.indexOf(c.id) >= 0);
    const r3 = st.r3;
    const m = slice(r3, st.sel3, tr);
    const mPrev = prevTotal(r3, tr);
    const mDiff = m.total - mPrev;
    const mPct = Math.round((Math.abs(mDiff) / Math.max(1, mPrev)) * 100);
    const mSetSel = (i: number) => patch({ sel3: st.sel3 === i ? null : i });

    const mOv = RANGE_IDS.map((id) => {
      const sl = slice(id, null, tr);
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
        onPress: () => patch({ v3: 'detail', r3: id, sel3: null }),
      };
    });

    const mStacks = m.bk.map((b, i) => {
      const segs = m.order
        .map((ci) => ({ h: Math.max(0, (b.per[ci] / m.max) * 164), color: CCOL[ci] }))
        .filter((s) => s.h > 0.6)
        .reverse();
      return {
        segs: segs.map((s, k) => ({ ...s, topRadius: k === 0 })),
        tick: m.bk.length > 12 && i % 5 !== 0 && i !== m.bk.length - 1 ? '' : b.tick,
        dim: !(m.sel == null || m.sel === i),
        active: m.sel === i,
        onPress: () => mSetSel(i),
      };
    });

    const todayPer = dayUsage();
    const nLim = Object.keys(st.limits).length;
    const openLimit = (i: number) => patch({ v3: 'limit', limitCat: i });

    const mLimits = CATS.map((c, i) => {
      const s = limState(i, st.limits, todayPer);
      return {
        id: c.id,
        name: c.name,
        color: CCOL[i],
        used: fmtShort(todayPer[i]) + ' today',
        limStr: s.lim == null ? 'Off' : limLabel(s.lim),
        text: s.text,
        bg: s.bg,
        fg: s.fg,
        pct: s.lim == null ? 0 : Math.min(100, (s.used / s.lim) * 100),
        barColor: s.over ? '#b5576b' : CCOL[i],
        onPress: () => openLimit(i),
      };
    });

    const li = st.limitCat != null ? st.limitCat : 0;
    const lSt = limState(li, st.limits, todayPer);

    const mRowsLim = m.rows.map((r) => {
      const s = limState(r.ci, st.limits, todayPer);
      return {
        ...r,
        limChip: s.lim == null ? 'Set limit' : limLabel(s.lim) + '/day',
        limBg: s.lim == null ? 'rgba(29,31,32,0.06)' : s.bg,
        limFg: s.lim == null ? 'rgba(29,31,32,0.50)' : s.fg,
        onPress: () => openLimit(r.ci),
      };
    });

    const pickRows = CATS.map((c, i) => {
      const on = st.tracked.indexOf(c.id) >= 0;
      const avgMin = fourteenDayAvg(i);
      return {
        id: c.id,
        name: c.name,
        avg: fmtShort(avgMin) + '/day',
        color: CCOL[i],
        on,
        onPress: () =>
          patch({ tracked: on ? st.tracked.filter((x) => x !== c.id) : st.tracked.concat([c.id]) }),
      };
    });

    return {
      view: st.v3,
      goOverview: () => patch({ v3: 'ov', sel3: null }),
      openPick: () => patch({ v3: 'pick' }),
      openLimits: () => patch({ v3: 'limits' }),
      backToLimits: () => patch({ v3: 'limits' }),
      limCount: nLim ? nLim + ' on' : 'Off',
      trackedLabel: st.tracked.length + '/' + CATS.length,
      allLabel: st.tracked.length === CATS.length ? 'Clear all' : 'Select all',
      toggleAll: () => patch({ tracked: st.tracked.length === CATS.length ? [] : CATS.map((c) => c.id) }),
      pickRows,

      overview: { cards: mOv },

      detail: {
        r3,
        ranges: RANGE_IDS.map((id) => ({
          id,
          label: RANGE_LABEL[id],
          active: r3 === id,
          onPress: () => patch({ r3: id, sel3: null }),
        })),
        fact: factFor(r3, m.total),
        scope: m.sel != null ? m.bk[m.sel].label : DATES[r3],
        total: fmt(m.total),
        avg: fmtShort(m.total / (m.sel != null ? 1 : N_DAYS[r3])),
        avgLabel: m.sel != null ? 'in this slice' : 'daily average',
        delta:
          m.sel != null
            ? 'Tap the bar again to clear'
            : Math.abs(mDiff) < 1
            ? 'Same as ' + PREV_NAME[r3]
            : (mDiff > 0 ? '↑ ' : '↓ ') + mPct + '% vs ' + PREV_NAME[r3],
        deltaPositive: mDiff > 0,
        deltaNeutral: m.sel != null,
        comp: m.order.map((ci) => ({ w: (m.scoped[ci] / Math.max(1, m.total)) * 100, color: CCOL[ci] })),
        stacks: mStacks,
        rows: mRowsLim,
        axisNote: { day: 'By hour', week: 'By day', month: 'By day', year: 'By month' }[r3],
        count: m.rows.length + ' categories',
        gap: r3 === 'month' ? 2 : r3 === 'day' ? 3 : 7,
      },

      limits: { list: mLimits },

      limitEditor: {
        name: CATS[li].name,
        color: CCOL[li],
        used: fmtShort(todayPer[li]),
        limitText: lSt.lim == null ? 'No limit set' : limLabel(lSt.lim) + ' a day',
        pct: lSt.lim == null ? 0 : Math.min(100, (todayPer[li] / lSt.lim) * 100),
        barColor: lSt.over ? '#b5576b' : CCOL[li],
        stateText: lSt.text,
        stateBg: lSt.bg,
        stateFg: lSt.fg,
        hint:
          lSt.lim == null
            ? 'Pick a daily budget. The app pauses when you hit it, and resets at midnight.'
            : 'Pauses ' + CATS[li].name.toLowerCase() + ' apps for the rest of the day once you hit it.',
        presets: PRESETS.map((v) => ({
          v,
          label: limLabel(v),
          active: lSt.lim === v,
          onPress: () => patch({ limits: { ...st.limits, [CATS[li].id]: v } }),
        })),
        hasLimit: lSt.lim != null,
        clear: () => {
          const n = { ...st.limits };
          delete n[CATS[li].id];
          patch({ limits: n });
        },
      },
    };
  }, [state]);
}
