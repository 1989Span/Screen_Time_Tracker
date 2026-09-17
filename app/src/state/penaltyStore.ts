// Penalty limit: `current` applies today, `next` is a saved change that starts
// tomorrow (undefined = no change, null = turn off). The editor edits a draft
// so today's charge can't be dodged by loosening the limit mid-day.

import { create } from 'zustand';
import { DEFAULT_PENALTY, DEMO_PENALTY, PENALTY_LIMIT_PRESETS, PenaltySetting, RATE_MAX, RATE_MIN, RATE_PRESETS } from '../data';
import { goTo } from './navStore';

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

interface PenaltyState {
  current: PenaltySetting | null;
  next: PenaltySetting | null | undefined;
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
}

/** What applies from tomorrow: a saved change, else today's setting. */
export const pendingSetting = (s: Pick<PenaltyState, 'current' | 'next'>) => (s.next === undefined ? s.current : s.next);

export const usePenaltyStore = create<PenaltyState>((set, get) => ({
  current: DEMO_PENALTY,
  next: undefined,
  draft: DEMO_PENALTY,
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
  save: () => set((s) => ({ next: sameSetting(s.draft, s.current) ? undefined : { ...s.draft } })),
  remove: () => set((s) => ({ next: s.current == null ? undefined : null })),
  undoPending: () => set({ next: undefined }),
}));
