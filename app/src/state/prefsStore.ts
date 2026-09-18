// Which categories count toward your own totals and charts. Shared by the
// overview, breakdown, penalty limit and the Settings screen.
//
// Persisted: this is a deliberate user choice, so it must survive a restart.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CATS } from '../data';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

interface PrefsState {
  tracked: string[];
  toggle: (id: string) => void;
  toggleAll: () => void;
}

const allIds = () => CATS.map((c) => c.id);

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      tracked: allIds(),
      toggle: (id) =>
        set((s) => ({
          tracked: s.tracked.indexOf(id) >= 0 ? s.tracked.filter((x) => x !== id) : s.tracked.concat([id]),
        })),
      toggleAll: () => set((s) => ({ tracked: s.tracked.length === CATS.length ? [] : allIds() })),
    }),
    {
      name: storageKey('prefs'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ tracked: s.tracked }),
      // Drop ids that no longer exist, so removing a category can't leave a
      // dangling reference that silently drops usage from every total.
      merge: (persisted, current) => {
        const p = persisted as Partial<PrefsState> | undefined;
        const known = new Set(allIds());
        const tracked = Array.isArray(p?.tracked) ? p!.tracked.filter((id) => known.has(id)) : current.tracked;
        return { ...current, tracked };
      },
    }
  )
);

/** Tracked flags in CATS order, which is what the data layer takes. */
export const trackedFlags = (tracked: string[]) => CATS.map((c) => tracked.indexOf(c.id) >= 0);
