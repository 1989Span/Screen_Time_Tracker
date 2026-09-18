// Per-category daily budgets (the Timers tab).
//
// Persisted: a limit the user set is meant to hold across restarts.
// `editing` is not - it is just which row the editor screen opened on.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CATS } from '../data';
import { goTo } from './navStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

interface TimersState {
  limits: Record<string, number>; // category id -> minutes
  editing: number; // index into CATS
  open: (catIndex: number) => void;
  setLimit: (catIndex: number, minutes: number) => void;
  clearLimit: (catIndex: number) => void;
}

export const useTimersStore = create<TimersState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: storageKey('timers'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ limits: s.limits }),
      // Keep only limits for categories that still exist and are sane numbers.
      merge: (persisted, current) => {
        const p = persisted as { limits?: Record<string, unknown> } | undefined;
        const known = new Set(CATS.map((c) => c.id));
        const limits: Record<string, number> = {};
        for (const [id, v] of Object.entries(p?.limits ?? {})) {
          if (known.has(id) && typeof v === 'number' && Number.isFinite(v) && v > 0) limits[id] = v;
        }
        return { ...current, limits };
      },
    }
  )
);
