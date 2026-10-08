// Penalty limit: the monthly plans (see penaltyPlan.ts) and the editor.
//
// Saving takes two steps. The first shows what will be locked and until when;
// only the second, "I understand", commits it. Once confirmed, a month can't be
// changed or switched off until it ends, except during the first days of a
// carried-over month.
//
// Persisted: the plans. The editor's fields and the confirmation step are
// deliberately not: a half-typed limit, or a half-made commitment, should not
// survive a restart.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { dayStamp } from '../clock';
import { DEFAULT_PENALTY, PENALTY_LIMIT_PRESETS, PenaltySetting, RATE_MAX, RATE_MIN, RATE_PRESETS } from '../data';
import { MonthPlan, Plans, confirm, monthOf, planFor } from '../penaltyPlan';
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

const isStamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const isPlan = (v: unknown): v is MonthPlan => {
  const p = v as Partial<MonthPlan>;
  return (
    typeof p === 'object' &&
    p !== null &&
    (p.setting === null || isSetting(p.setting)) &&
    isStamp(p.from) &&
    typeof p.confirmed === 'boolean'
  );
};

interface PenaltyState {
  plans: Plans;

  draft: PenaltySetting;
  rateText: string;
  limitH: string;
  limitM: string;
  /** The choice awaiting "I understand": a setting, null to switch off, undefined when not confirming. */
  pending: PenaltySetting | null | undefined;

  openEditor: () => void;
  openHistory: () => void;
  setLimitPreset: (minutes: number) => void;
  setLimitFields: (h: string, m: string) => void;
  setRatePreset: (rate: number) => void;
  setRateText: (text: string) => void;
  /** First step: show what confirming would lock. */
  review: (choice: PenaltySetting | null) => void;
  /** Back out of the confirmation step. */
  cancelReview: () => void;
  /** Second step: commit the reviewed choice. */
  confirmReview: () => void;
}

export const usePenaltyStore = create<PenaltyState>()(
  persist(
    (set, get) => ({
      plans: {},
      draft: DEFAULT_PENALTY,
      rateText: '',
      limitH: '',
      limitM: '',
      pending: undefined,

      openEditor: () => {
        const draft = planFor(get().plans, monthOf(dayStamp()))?.setting ?? DEFAULT_PENALTY;
        const isPreset = PENALTY_LIMIT_PRESETS.indexOf(draft.limit) >= 0;
        set({
          draft,
          pending: undefined,
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

      review: (choice) => set({ pending: choice === null ? null : { ...choice } }),
      cancelReview: () => set({ pending: undefined }),
      confirmReview: () => {
        const { pending, plans } = get();
        if (pending === undefined) return;
        const next = confirm(plans, pending, dayStamp());
        // Null means the month locked while the screen was open (the window
        // closed at midnight, say). Nothing changes.
        set(next ? { plans: next, pending: undefined } : { pending: undefined });
      },
    }),
    {
      name: storageKey('penalty-plans'),
      version: STORAGE_VERSION,
      storage: deviceStorage,
      partialize: (s) => ({ plans: s.plans }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PenaltyState> | undefined;
        if (!p || typeof p.plans !== 'object' || p.plans === null) return current;
        // Anything that isn't a plan the editor could have made is dropped, so
        // a corrupt payload can't put an impossible limit on screen.
        const plans: Plans = {};
        for (const [month, plan] of Object.entries(p.plans)) {
          if (/^\d{4}-\d{2}$/.test(month) && isPlan(plan)) plans[month] = plan;
        }
        return { ...current, plans };
      },
    }
  )
);
