// App timers: the per-app list and the single-app editor.
//
// One row per tracked app rather than per category. The list is therefore as long
// as the user's selection, and a limit belongs to a package name, not a position.

import { useMemo } from 'react';

import { PRESETS, dayUsage, fmtShort, limLabel, series } from '../data';
import { useAppsStore } from '../state/appsStore';
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
  /** Shown when nothing is tracked, so an empty Timers tab explains itself. */
  emptyNote: string | null;
}

export function useTimersModel(): TimersViewModel {
  const dataVersion = useAppsStore((s) => s.dataVersion);
  const limits = useTimersStore((s) => s.limits);
  const open = useTimersStore((s) => s.open);

  return useMemo(() => {
    const todayPer = dayUsage();
    const list = series().map((ser, i) => {
      const s = limitState(ser.id, i, limits, todayPer);
      return {
        id: ser.id,
        name: ser.name,
        color: ser.color,
        used: fmtShort(todayPer[i] ?? 0) + ' today',
        limStr: s.limit == null ? 'Off' : limLabel(s.limit),
        text: s.text,
        bg: s.bg,
        fg: s.fg,
        pct: s.limit == null ? 0 : Math.min(100, (s.used / s.limit) * 100),
        barColor: s.over ? OVER_BAR : ser.color,
        onPress: () => open(ser.id),
      };
    });
    return {
      list,
      emptyNote: list.length === 0 ? 'Pick some apps under Settings and they will show up here.' : null,
    };
  }, [limits, open, dataVersion]);
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
  const dataVersion = useAppsStore((s) => s.dataVersion);
  const limits = useTimersStore((s) => s.limits);
  const editing = useTimersStore((s) => s.editing);
  const setLimit = useTimersStore((s) => s.setLimit);
  const clearLimit = useTimersStore((s) => s.clearLimit);
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const todayPer = dayUsage();
    const list = series();
    // The app being edited can vanish from the selection (or the device) between
    // opening the editor and rendering it, so fall back rather than crash.
    const index = list.findIndex((x) => x.id === editing);
    const ser = index >= 0 ? list[index] : { id: editing, name: editing || 'App', color: OVER_BAR };
    const s = limitState(ser.id, index, limits, todayPer);
    const used = index >= 0 ? (todayPer[index] ?? 0) : 0;

    return {
      name: ser.name,
      color: ser.color,
      used: fmtShort(used),
      limitText: s.limit == null ? 'No limit set' : limLabel(s.limit) + ' a day',
      pct: s.limit == null ? 0 : Math.min(100, (used / s.limit) * 100),
      barColor: s.over ? OVER_BAR : ser.color,
      stateText: s.text,
      stateBg: s.bg,
      stateFg: s.fg,
      hint:
        s.limit == null
          ? 'Pick a daily budget for this app. It resets at midnight.'
          : `Once ${ser.name} passes this, the rest of the day counts as over.`,
      presets: PRESETS.map((v) => ({
        v,
        label: limLabel(v),
        active: s.limit === v,
        onPress: () => setLimit(ser.id, v),
      })),
      hasLimit: s.limit != null,
      clear: () => clearLimit(ser.id),
      backToLimits: () => go('limits'),
    };
  }, [limits, editing, setLimit, clearLimit, go, dataVersion]);
}
