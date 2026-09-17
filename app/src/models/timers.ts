// App timers: the per-category list and the single-category editor.

import { useMemo } from 'react';
import { CATS, CCOL, PRESETS, dayUsage, fmtShort, limLabel } from '../data';
import { useNavStore } from '../state/navStore';
import { useTimersStore } from '../state/timersStore';
import { OVER_BAR, limitState } from './shared';

export interface TimerRow {
  id: string;
  name: string;
  color: string;
  used: string;
  limStr: string;
  text: string;
  bg: string;
  fg: string;
  pct: number;
  barColor: string;
  onPress: () => void;
}

export interface TimersViewModel {
  list: TimerRow[];
}

export function useTimersModel(): TimersViewModel {
  const limits = useTimersStore((s) => s.limits);
  const open = useTimersStore((s) => s.open);

  return useMemo(() => {
    const todayPer = dayUsage();
    return {
      list: CATS.map((c, i) => {
        const s = limitState(i, limits, todayPer);
        return {
          id: c.id,
          name: c.name,
          color: CCOL[i],
          used: fmtShort(todayPer[i]) + ' today',
          limStr: s.limit == null ? 'Off' : limLabel(s.limit),
          text: s.text,
          bg: s.bg,
          fg: s.fg,
          pct: s.limit == null ? 0 : Math.min(100, (s.used / s.limit) * 100),
          barColor: s.over ? OVER_BAR : CCOL[i],
          onPress: () => open(i),
        };
      }),
    };
  }, [limits, open]);
}

export interface TimerEditorViewModel {
  name: string;
  color: string;
  used: string;
  limitText: string;
  pct: number;
  barColor: string;
  stateText: string;
  stateBg: string;
  stateFg: string;
  hint: string;
  presets: { v: number; label: string; active: boolean; onPress: () => void }[];
  hasLimit: boolean;
  clear: () => void;
  backToLimits: () => void;
}

export function useTimerEditorModel(): TimerEditorViewModel {
  const limits = useTimersStore((s) => s.limits);
  const editing = useTimersStore((s) => s.editing);
  const setLimit = useTimersStore((s) => s.setLimit);
  const clearLimit = useTimersStore((s) => s.clearLimit);
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const todayPer = dayUsage();
    const s = limitState(editing, limits, todayPer);
    const used = todayPer[editing];

    return {
      name: CATS[editing].name,
      color: CCOL[editing],
      used: fmtShort(used),
      limitText: s.limit == null ? 'No limit set' : limLabel(s.limit) + ' a day',
      pct: s.limit == null ? 0 : Math.min(100, (used / s.limit) * 100),
      barColor: s.over ? OVER_BAR : CCOL[editing],
      stateText: s.text,
      stateBg: s.bg,
      stateFg: s.fg,
      hint:
        s.limit == null
          ? 'Pick a daily budget. The app pauses when you hit it, and resets at midnight.'
          : 'Pauses ' + CATS[editing].name.toLowerCase() + ' apps for the rest of the day once you hit it.',
      presets: PRESETS.map((v) => ({
        v,
        label: limLabel(v),
        active: s.limit === v,
        onPress: () => setLimit(editing, v),
      })),
      hasLimit: s.limit != null,
      clear: () => clearLimit(editing),
      backToLimits: () => go('limits'),
    };
  }, [limits, editing, setLimit, clearLimit, go]);
}
