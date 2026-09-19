// Penalty limit: the Overview card, the settings editor and the charge history.

import { useMemo } from 'react';
import {
  PENALTY_LIMIT_PRESETS,
  PenaltySetting,
  RATE_MAX,
  RATE_MIN,
  RATE_PRESETS,
  unlockDateFrom,
  chargeFor,
  chargeHistory,
  daysUntilUnlock,
  fmtDate,
  fmtMoney,
  fmtShort,
  limLabel,
  minutesOver,
  trackedToday,
} from '../data';
import { dayStampToDate, daysSinceStamp } from '../usage/ledger';
import { useNavStore } from '../state/navStore';
import { parseLimit, parseRate, pendingSetting, sameSetting, usePenaltyStore } from '../state/penaltyStore';
import { trackedFlags, usePrefsStore } from '../state/prefsStore';
import { CHIP_OFF, OVER_BAR, OVER_BG, OVER_FG, StateChip, UNDER_BG, UNDER_FG } from './shared';

const settingText = (s: PenaltySetting | null) =>
  s ? limLabel(s.limit) + ' a day · ' + fmtMoney(s.rate) + '/min' : 'Off';

const pendingText = (next: PenaltySetting | null | undefined) =>
  next === undefined ? '' : 'From tomorrow: ' + settingText(next);

export interface PenaltyCardViewModel {
  on: boolean;
  stateText: string;
  stateBg: string;
  stateFg: string;
  used: string;
  limitText: string;
  pct: number;
  barColor: string;
  chargeToday: string;
  chargeNote: string;
  locked: string;
  lockedNote: string;
  pendingText: string;
  openSettings: () => void;
  openHistory: () => void;
}

/** Today's usage against the limit, plus the resulting charge. */
function today(current: PenaltySetting | null, tracked: string[]) {
  const used = trackedToday(trackedFlags(tracked));
  const over = current ? minutesOver(used, current.limit) : 0;
  return { used, over, charge: current ? chargeFor(used, current) : 0 };
}

export function usePenaltyCardModel(): PenaltyCardViewModel {
  const tracked = usePrefsStore((s) => s.tracked);
  const current = usePenaltyStore((s) => s.current);
  const next = usePenaltyStore((s) => s.next);
  const openEditor = usePenaltyStore((s) => s.openEditor);
  const openHistory = usePenaltyStore((s) => s.openHistory);
  const startedOn = usePenaltyStore((s) => s.startedOn);

  return useMemo(() => {
    const { used, over, charge } = today(current, tracked);
    // Only days since the user switched a penalty on can carry a charge.
    const history = chargeHistory(current, daysSinceStamp(startedOn));
    const chip: StateChip =
      current == null
        ? CHIP_OFF
        : over > 0
          ? { text: fmtShort(over) + ' over', bg: OVER_BG, fg: OVER_FG }
          : { text: fmtShort(current.limit - used) + ' left', bg: UNDER_BG, fg: UNDER_FG };

    return {
      on: current != null,
      stateText: chip.text,
      stateBg: chip.bg,
      stateFg: chip.fg,
      used: fmtShort(used),
      limitText: current ? 'of ' + limLabel(current.limit) + ' limit' : 'No limit today',
      pct: current ? Math.min(100, (used / current.limit) * 100) : 0,
      barColor: over > 0 ? OVER_BAR : '#4f8c7b',
      chargeToday: fmtMoney(charge),
      chargeNote: current ? fmtMoney(current.rate) + '/min · settles at midnight' : 'No charge today',
      locked: fmtMoney(history.length ? history[0].balance : 0),
      lockedNote:
        startedOn === '' ? 'Nothing locked yet' : 'Locked until ' + fmtDate(unlockDateFrom(dayStampToDate(startedOn))),
      pendingText: pendingText(next),
      openSettings: openEditor,
      openHistory,
    };
  }, [tracked, current, next, openEditor, openHistory]);
}

export interface PresetButton {
  v: number;
  label: string;
  active: boolean;
  onPress: () => void;
}

export interface PenaltyEditorViewModel {
  activeText: string;
  pendingText: string;
  undoPending: () => void;
  limitPresets: PresetButton[];
  limitH: string;
  limitM: string;
  setLimitH: (text: string) => void;
  setLimitM: (text: string) => void;
  limitError: string;
  ratePresets: PresetButton[];
  rateText: string;
  setRateText: (text: string) => void;
  rateError: string;
  summary: string;
  canSave: boolean;
  save: () => void;
  canRemove: boolean;
  remove: () => void;
  lockNote: string;
  goOverview: () => void;
}

export function usePenaltyEditorModel(): PenaltyEditorViewModel {
  const store = usePenaltyStore();
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const { current, next, draft, rateText, limitH, limitM } = store;
    const pending = pendingSetting(store);
    const rateError = rateText !== '' && parseRate(rateText) == null;
    const limitCustom = limitH !== '' || limitM !== '';
    const limitError = limitCustom && parseLimit(limitH, limitM) == null;

    return {
      activeText: settingText(current),
      pendingText: pendingText(next),
      undoPending: store.undoPending,
      limitPresets: PENALTY_LIMIT_PRESETS.map((v) => ({
        v,
        label: limLabel(v),
        active: !limitCustom && draft.limit === v,
        onPress: () => store.setLimitPreset(v),
      })),
      limitH,
      limitM,
      setLimitH: (t: string) => store.setLimitFields(t.replace(/\D/g, ''), limitM),
      setLimitM: (t: string) => store.setLimitFields(limitH, t.replace(/\D/g, '')),
      limitError: limitError ? 'Enter up to 23 hours and 59 minutes' : '',
      ratePresets: RATE_PRESETS.map((v) => ({
        v,
        label: v < 1 ? Math.round(v * 100) + '¢' : '$' + v,
        active: rateText === '' && draft.rate === v,
        onPress: () => store.setRatePreset(v),
      })),
      rateText,
      setRateText: store.setRateText,
      rateError: rateError ? 'Enter an amount from ' + fmtMoney(RATE_MIN) + ' to ' + fmtMoney(RATE_MAX) : '',
      summary: limLabel(draft.limit) + ' a day, then ' + fmtMoney(draft.rate) + ' for every minute over',
      canSave: !rateError && !limitError && !sameSetting(draft, pending),
      save: store.save,
      canRemove: pending != null,
      remove: store.remove,
      lockNote: 'Charges settle at midnight and stay locked for a year. Changes start tomorrow.',
      goOverview: () => go('ov'),
    };
  }, [store, go]);
}

export interface ChargeRow {
  label: string;
  detail: string;
  amount: string;
  balance: string;
  over: boolean;
}

export interface PenaltyHistoryViewModel {
  locked: string;
  unlockText: string;
  daysOver: string;
  minutesOver: string;
  today: { detail: string; amount: string } | null;
  rows: ChargeRow[];
  goOverview: () => void;
}

export function usePenaltyHistoryModel(): PenaltyHistoryViewModel {
  const tracked = usePrefsStore((s) => s.tracked);
  const current = usePenaltyStore((s) => s.current);
  const startedOn = usePenaltyStore((s) => s.startedOn);
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const history = chargeHistory(current, daysSinceStamp(startedOn));
    const { over, charge } = today(current, tracked);

    return {
      locked: fmtMoney(history.length ? history[0].balance : 0),
      unlockText:
        startedOn === ''
          ? 'No charges yet'
          : 'Unlocks ' +
            fmtDate(unlockDateFrom(dayStampToDate(startedOn))) +
            ' · ' +
            daysUntilUnlock(dayStampToDate(startedOn)) +
            ' days to go',
      daysOver: history.filter((d) => d.charge > 0).length + ' of ' + history.length,
      minutesOver: fmtShort(history.reduce((sum, d) => sum + d.over, 0)),
      today: current
        ? {
            detail: over > 0 ? fmtShort(over) + ' over ' + limLabel(current.limit) : 'Under ' + limLabel(current.limit),
            amount: fmtMoney(charge),
          }
        : null,
      rows: history.map((d) => ({
        label: d.label,
        detail: d.over > 0 ? fmtShort(d.over) + ' over ' + limLabel(d.limit) : 'Under ' + limLabel(d.limit),
        amount: d.charge > 0 ? fmtMoney(d.charge) : '—',
        balance: fmtMoney(d.balance),
        over: d.charge > 0,
      })),
      goOverview: () => go('ov'),
    };
  }, [tracked, current, go]);
}
