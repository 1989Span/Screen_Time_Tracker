// Per-app daily budgets (the Timers tab).
//
// Keyed by package name, not by position. The tracked list changes whenever the
// user edits their selection, so an index-keyed limit would quietly reattach
// itself to whichever app happened to land in that slot.
//
// Persisted: a limit the user set is meant to hold across restarts. `editing` is
// not - it only records which row opened the editor.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { goTo } from './navStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

interface TimersState {
  /** package name -> minutes a day. */
  limits: Record<string, number>;
  /** package name whose editor is open. */
  editing: string;
  open: (seriesId: string) => void;
  setLimit: (seriesId: string, minutes: number) => void;
  clearLimit: (seriesId: string) => void;
}

export const useTimersStore = create<TimersState>()(
  persist(
    (set) => ({
      limits: {},
      editing: '',
      open: (seriesId) => {
        set({ editing: seriesId });
        goTo('limit');
      },
      setLimit: (seriesId, minutes) => set((s) => ({ limits: { ...s.limits, [seriesId]: minutes } })),
      clearLimit: (seriesId) =>
        set((s) => {
          const limits = { ...s.limits };
          delete limits[seriesId];
          return { limits };
        }),
    }),
    {
      name: storageKey('timers'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ limits: s.limits }),
      merge: (persisted, current) => {
        const p = persisted as { limits?: Record<string, unknown> } | undefined;
        const limits: Record<string, number> = {};
        for (const [id, v] of Object.entries(p?.limits ?? {})) {
          // No check against installed apps: a limit for an app that is absent
          // today is harmless, and history outlives installation, so dropping it
          // would lose a setting the user would expect back on reinstall.
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) limits[id] = v;
        }
        return { ...current, limits };
      },
    }
  )
);
