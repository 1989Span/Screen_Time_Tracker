// Which categories count toward your own totals and charts. Shared by the
// overview, breakdown, penalty limit and the Settings screen.

import { create } from 'zustand';
import { CATS } from '../data';

interface PrefsState {
  tracked: string[];
  toggle: (id: string) => void;
  toggleAll: () => void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  tracked: CATS.map((c) => c.id),
  toggle: (id) =>
    set((s) => ({ tracked: s.tracked.indexOf(id) >= 0 ? s.tracked.filter((x) => x !== id) : s.tracked.concat([id]) })),
  toggleAll: () => set((s) => ({ tracked: s.tracked.length === CATS.length ? [] : CATS.map((c) => c.id) })),
}));

/** Tracked flags in CATS order, which is what the data layer takes. */
export const trackedFlags = (tracked: string[]) => CATS.map((c) => tracked.indexOf(c.id) >= 0);
