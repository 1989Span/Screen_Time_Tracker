// Penalty limit: `current` applies today, `next` is a saved change that starts
// tomorrow (undefined = no change, null = turn off). The editor edits a draft
// so today's charge can't be dodged by loosening the limit mid-day.
//
// Persisted: current, next, and the day `current` took effect.
//
// That last field matters. "Starts tomorrow" only means anything if something
// actually promotes `next` into `current` once tomorrow arrives. Before state
// persisted, the app never outlived a day, so nothing had to. Now a user can
// save a change, close the app, reopen it the next day - and without the
// promotion below it would still read "From tomorrow: ..." forever, never
// applying. `appliedOn` is what makes the boundary detectable across launches.
//
// The editor scratch fields (draft, rateText, limitH, limitM) are deliberately
// not persisted: a half-typed limit should not survive a restart.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_PENALTY, PENALTY_LIMIT_PRESETS, PenaltySetting, RATE_MAX, RATE_MIN, RATE_PRESETS } from '../data';
import { dayStamp, onDayChange } from '../clock';
import { goTo } from './navStore';
import { STORAGE_VERSION, deviceStorage, storageKey } from './storage';

export const sameSetting = (a: PenaltySetting | null, b: PenaltySetting | null) =>
  a === b || (a != null && b != null && a.limit === b.limit && a.rate === b.rate);

export function parseRate(text: string): number | null {
  const v = parseFloat(text.replace(/[$,\s]/g, ''));
  if (!isFinite(v) || v < RATE_MIN || v > RATE_MAX) return null;
  return Math.round(v * 100) / 100;
}

/** Custom limit from the hour/minute fields; an empty field counts as 0. */
export function parseLimit(h: string, m: string): number | null {
  if (!/^\d{0,2}$/.test(h) || !/^\d{0,2}$/.test(m)) return null;
  const hv = Number(h || 0);
  const mv = Number(m || 0);
  if (hv > 23 || mv > 59 || hv * 60 + mv < 1) return null;
  return hv * 60 + mv;
}

/** A setting is only valid if it would survive being re-entered by hand. */
const isSetting = (v: unknown): v is PenaltySetting => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<PenaltySetting>;
  return (
    typeof s.limit === 'number' &&
    Number.isFinite(s.limit) &&
    s.limit >= 1 &&
    s.limit <= 24 * 60 &&
    typeof s.rate === 'number' &&
    Number.isFinite(s.rate) &&
    s.rate >= RATE_MIN &&
    s.rate <= RATE_MAX
  );
};

interface PenaltyState {
  current: PenaltySetting | null;
  next: PenaltySetting | null | undefined;
  /** Day stamp on which `current` took effect; drives the promotion above. */
  appliedOn: string;
  /** Day stamp on which a penalty was first switched on, or '' if never.
   *  The ledger starts here: applying today's limit to days before the user
   *  opted in would invent a debt that was never incurred. */
  startedOn: string;
  draft: PenaltySetting;
  rateText: string;
  limitH: string;
  limitM: string;
  openEditor: () => void;
  openHistory: () => void;
  setLimitPreset: (minutes: number) => void;
  setLimitFields: (h: string, m: string) => void;
  setRatePreset: (rate: number) => void;
  setRateText: (text: string) => void;
  save: () => void;
  remove: () => void;
  undoPending: () => void;
  /** Apply a saved "from tomorrow" change if the day has moved on. Idempotent. */
  promoteIfNewDay: () => void;
}

/** What applies from tomorrow: a saved change, else today's setting. */
export const pendingSetting = (s: Pick<PenaltyState, 'current' | 'next'>) =>
  s.next === undefined ? s.current : s.next;

/** Pure form of the promotion, so it can be unit-tested without a store. */
export function promote<T extends Pick<PenaltyState, 'current' | 'next' | 'appliedOn'>>(s: T, today: string) {
  if (s.appliedOn === today) return null;
  return {
    current: s.next === undefined ? s.current : s.next,
    next: undefined,
    appliedOn: today,
  };
}

export const usePenaltyStore = create<PenaltyState>()(
  persist(
    (set, get) => ({
      // No penalty until the user sets one. There is no starting charge.
      current: null,
      next: undefined,
      appliedOn: dayStamp(),
      startedOn: '',
      draft: DEFAULT_PENALTY,
      rateText: '',
      limitH: '',
      limitM: '',

      openEditor: () => {
        const draft = pendingSetting(get()) || DEFAULT_PENALTY;
        const isPreset = PENALTY_LIMIT_PRESETS.indexOf(draft.limit) >= 0;
        set({
          draft,
          rateText: RATE_PRESETS.indexOf(draft.rate) >= 0 ? '' : draft.rate.toFixed(2),
          limitH: isPreset ? '' : String(Math.floor(draft.limit / 60)),
          limitM: isPreset ? '' : String(draft.limit % 60),
        });
        goTo('penalty');
      },
      openHistory: () => goTo('history'),

      setLimitPreset: (minutes) => set((s) => ({ draft: { ...s.draft, limit: minutes }, limitH: '', limitM: '' })),
      setLimitFields: (h, m) =>
        set((s) => {
          const limit = parseLimit(h, m);
          return limit != null ? { limitH: h, limitM: m, draft: { ...s.draft, limit } } : { limitH: h, limitM: m };
        }),
      setRatePreset: (rate) => set((s) => ({ draft: { ...s.draft, rate }, rateText: '' })),
      setRateText: (text) =>
        set((s) => {
          const rate = parseRate(text);
          return rate != null ? { rateText: text, draft: { ...s.draft, rate } } : { rateText: text };
        }),

      // Saving a draft identical to today's setting just cancels a pending change.
      save: () =>
        set((s) => ({
          next: sameSetting(s.draft, s.current) ? undefined : { ...s.draft },
          // First time a limit is saved, the ledger's clock starts.
          startedOn: s.startedOn === '' ? dayStamp() : s.startedOn,
        })),
      remove: () => set((s) => ({ next: s.current == null ? undefined : null })),
      undoPending: () => set({ next: undefined }),

      promoteIfNewDay: () => {
        const patch = promote(get(), dayStamp());
        if (patch) set(patch);
      },
    }),
    {
      name: storageKey('penalty'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ current: s.current, next: s.next, appliedOn: s.appliedOn, startedOn: s.startedOn }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PenaltyState> | undefined;
        if (!p) return current;
        // Reject anything that isn't a setting we would accept from the editor,
        // so a corrupt or older payload can't put an impossible limit on screen.
        const restored = {
          ...current,
          current: p.current === null ? null : isSetting(p.current) ? p.current : current.current,
          next: p.next === undefined ? undefined : p.next === null ? null : isSetting(p.next) ? p.next : undefined,
          appliedOn: typeof p.appliedOn === 'string' ? p.appliedOn : current.appliedOn,
          startedOn: typeof p.startedOn === 'string' ? p.startedOn : current.startedOn,
        };
        // Reopening on a later day is exactly when "starts tomorrow" comes due.
        return { ...restored, ...(promote(restored, dayStamp()) ?? {}) };
      },
    }
  )
);

// Also promote while the app is open across midnight, not just on launch.
onDayChange(() => {
  usePenaltyStore.getState().promoteIfNewDay();
});
