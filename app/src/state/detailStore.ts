// Which timeframe the breakdown screen shows, and which bar is scoped into.

import { create } from 'zustand';
import { RangeId } from '../data';
import { goTo } from './navStore';

interface DetailState {
  range: RangeId;
  selected: number | null; // bucket index, or null for the whole range
  setRange: (range: RangeId) => void;
  toggleBucket: (index: number) => void;
  openRange: (range: RangeId) => void;
}

export const useDetailStore = create<DetailState>((set) => ({
  range: 'week',
  selected: null,
  setRange: (range) => set({ range, selected: null }),
  toggleBucket: (index) => set((s) => ({ selected: s.selected === index ? null : index })),
  openRange: (range) => {
    set({ range, selected: null });
    goTo('detail');
  },
}));
