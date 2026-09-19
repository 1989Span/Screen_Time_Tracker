// Which screen is showing, and which bottom tab that screen belongs to.
// Feature stores call `go()` when an action also navigates.

import { create } from 'zustand';

export type View =
  | 'ov'
  | 'detail'
  | 'pick'
  | 'limits'
  | 'limit'
  | 'penalty'
  | 'history'
  | 'groups'
  | 'groupSettings'
  | 'groupRules'
  | 'groupInvite'
  | 'newGroup'
  | 'apps';

export type Tab = 'overview' | 'groups' | 'timers' | 'settings';

export const TAB_OF: Record<View, Tab> = {
  ov: 'overview',
  detail: 'overview',
  penalty: 'overview',
  history: 'overview',
  groups: 'groups',
  groupSettings: 'groups',
  groupRules: 'groups',
  groupInvite: 'groups',
  newGroup: 'groups',
  limits: 'timers',
  limit: 'timers',
  pick: 'settings',
  apps: 'settings',
};

export const TABS: { id: Tab; label: string; root: View }[] = [
  { id: 'overview', label: 'Overview', root: 'ov' },
  { id: 'groups', label: 'Groups', root: 'groups' },
  { id: 'timers', label: 'Timers', root: 'limits' },
  // Settings opens the app picker: the old category screen is obsolete now that
  // tracking is per app, and the picker is how a user changes what is measured.
  { id: 'settings', label: 'Settings', root: 'apps' },
];

interface NavState {
  view: View;
  go: (view: View) => void;
}

export const useNavStore = create<NavState>((set) => ({
  view: 'ov',
  go: (view) => set({ view }),
}));

/** Navigate from outside a component (feature stores, tests). */
export const goTo = (view: View) => useNavStore.getState().go(view);
