// Per-category daily budgets (the Timers tab).

import { create } from 'zustand';
import { CATS } from '../data';
import { goTo } from './navStore';

interface TimersState {
  limits: Record<string, number>; // category id -> minutes
  editing: number; // index into CATS
  open: (catIndex: number) => void;
  setLimit: (catIndex: number, minutes: number) => void;
  clearLimit: (catIndex: number) => void;
}

export const useTimersStore = create<TimersState>((set) => ({
  limits: {},
  editing: 0,
  open: (catIndex) => {
    set({ editing: catIndex });
    goTo('limit');
  },
  setLimit: (catIndex, minutes) => set((s) => ({ limits: { ...s.limits, [CATS[catIndex].id]: minutes } })),
  clearLimit: (catIndex) =>
    set((s) => {
      const limits = { ...s.limits };
      delete limits[CATS[catIndex].id];
      return { limits };
    }),
}));
