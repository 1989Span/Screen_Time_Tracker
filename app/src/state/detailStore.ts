// Which timeframe the breakdown screen shows, and which bar is scoped into.
//
// Persisted: the timeframe only. Which bar was tapped is a transient scope, and
// a bar index means a different day tomorrow - restoring it would silently
// scope the chart to the wrong slice.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { RangeId } from '../data';
import { goTo } from './navStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

interface DetailState {
  range: RangeId;
  selected: number | null; // bucket index, or null for the whole range
  setRange: (range: RangeId) => void;
  toggleBucket: (index: number) => void;
  openRange: (range: RangeId) => void;
}

const RANGES: RangeId[] = ['day', 'week', 'month', 'year'];

export const useDetailStore = create<DetailState>()(
  persist(
    (set) => ({
      range: 'week',
      selected: null,
      setRange: (range) => set({ range, selected: null }),
      toggleBucket: (index) => set((s) => ({ selected: s.selected === index ? null : index })),
      openRange: (range) => {
        set({ range, selected: null });
        goTo('detail');
      },
    }),
    {
      name: storageKey('detail'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ range: s.range }),
      merge: (persisted, current) => {
        const p = persisted as { range?: unknown } | undefined;
        const range = RANGES.includes(p?.range as RangeId) ? (p!.range as RangeId) : current.range;
        return { ...current, range, selected: null };
      },
    }
  )
);
