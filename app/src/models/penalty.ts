// Penalty limit: the Overview card, the settings editor and the charge history.
// Paper money throughout: the app keeps the tally, nothing is paid.

import { useMemo } from 'react';
import {
  PENALTY_LIMIT_PRESETS,
  PenaltySetting,
  RATE_MAX,
  RATE_MIN,
  RATE_PRESETS,
  chargeFor,
  fmtMoney,
  fmtShort,
  limLabel,
  minutesOver,
  trackedToday,
} from '../data';
import { dayStamp } from '../clock';
import {
  ChargeDay,
  EditState,
  chargeLedger,
  editState,
  firstChargeDay,
  lastOfMonth,
  longDay,
  monthName,
  monthOf,
  planFor,
  settingOn,
  totalOf,
} from '../penaltyPlan';
import { useAppsStore } from '../state/appsStore';
import { useNavStore } from '../state/navStore';
import { parseLimit, parseRate, sameSetting, usePenaltyStore } from '../state/penaltyStore';
import { CHIP_OFF, OVER_BAR, OVER_BG, OVER_FG, StateChip, UNDER_BG, UNDER_FG } from './shared';

const settingText = (s: PenaltySetting | null) =>
  s ? limLabel(s.limit) + ' a day · ' + fmtMoney(s.rate) + '/min' : 'Off';

/** Today's usage against today's limit, plus the running charge. */
function todayCharge(setting: PenaltySetting | null) {
  const used = trackedToday();
  return {
    used,
    over: setting ? minutesOver(used, setting.limit) : 0,
    charge: setting ? chargeFor(used, setting) : 0,
  };
}

/** One line on where this month stands, for the card and editor. */
function statusLine(state: EditState): string {
  if (state.kind === 'locked') return 'Locked until ' + longDay(state.until);
  if (state.kind === 'window') {
    return 'Carried over from last month. Keep or change it by ' + longDay(state.until) + '.';
  }
  return '';
}

// --- Overview card -------------------------------------------------------------

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
  monthTotal: string;
  monthNote: string;
  allTime: string;
  allTimeNote: string;
  status: string;
  /** In the change window and not yet confirmed: the card asks for it. */
  needsConfirm: boolean;
  openSettings: () => void;
  openHistory: () => void;
}

export function usePenaltyCardModel(): PenaltyCardViewModel {
  const plans = usePenaltyStore((s) => s.plans);
  const openEditor = usePenaltyStore((s) => s.openEditor);
  const openHistory = usePenaltyStore((s) => s.openHistory);
  // Usage loads asynchronously; without this the card keeps its empty values.
  const dataVersion = useAppsStore((s) => s.dataVersion);

  return useMemo(() => {
    const today = dayStamp();
    const month = monthOf(today);
    const setting = settingOn(plans, today);
    const { used, over, charge } = todayCharge(setting);
    const ledger = chargeLedger(plans, today);
    const state = editState(plans, today);
    const first = firstChargeDay(plans);
    const chip: StateChip =
      setting == null
        ? CHIP_OFF
        : over > 0
          ? { text: fmtShort(over) + ' over', bg: OVER_BG, fg: OVER_FG }
          : { text: fmtShort(setting.limit - used) + ' left', bg: UNDER_BG, fg: UNDER_FG };

    return {
      on: setting != null,
      stateText: chip.text,
      stateBg: chip.bg,
      stateFg: chip.fg,
      used: fmtShort(used),
      limitText: setting ? 'of ' + limLabel(setting.limit) + ' limit' : 'No limit this month',
      pct: setting ? Math.min(100, (used / setting.limit) * 100) : 0,
      barColor: over > 0 ? OVER_BAR : '#4f8c7b',
      chargeToday: fmtMoney(charge),
      chargeNote: setting ? fmtMoney(setting.rate) + '/min · settles at midnight' : 'No charge today',
      monthTotal: fmtMoney(totalOf(ledger.filter((d) => monthOf(d.stamp) === month)) + charge),
      monthNote: monthName(month) + ' so far',
      allTime: fmtMoney(totalOf(ledger) + charge),
      allTimeNote: first ? 'since ' + longDay(first) : 'Nothing charged yet',
      status: statusLine(state),
      needsConfirm: state.kind === 'window',
      openSettings: openEditor,
      openHistory,
    };
  }, [plans, openEditor, openHistory, dataVersion]);
}

// --- Editor --------------------------------------------------------------------

export interface PresetButton {
  v: number;
  label: string;
  active: boolean;
  onPress: () => void;
}

export interface PenaltyReview {
  title: string;
  lines: string[];
  confirmLabel: string;
  confirm: () => void;
  cancel: () => void;
}

export interface PenaltyEditorViewModel {
  /** 'open' and 'window' show the form; 'locked' shows the running month only. */
  mode: EditState['kind'];
  heading: string;
  activeText: string;
  status: string;
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
  saveLabel: string;
  save: () => void;
  /** In the window: keep last month's settings as they are. */
  keep: (() => void) | null;
  /** In the window: no penalty this month. */
  turnOff: (() => void) | null;
  lockNote: string;
  /** The "I understand" step, while it is showing. */
  review: PenaltyReview | null;
  goOverview: () => void;
}

export function usePenaltyEditorModel(): PenaltyEditorViewModel {
  const store = usePenaltyStore();
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const { plans, draft, rateText, limitH, limitM, pending } = store;
    const today = dayStamp();
    const month = monthOf(today);
    const name = monthName(month);
    const state = editState(plans, today);
    const plan = planFor(plans, month);
    const carried = plan?.setting ?? null;
    const rateError = rateText !== '' && parseRate(rateText) == null;
    const limitCustom = limitH !== '' || limitM !== '';
    const limitError = limitCustom && parseLimit(limitH, limitM) == null;
    const until = longDay(lastOfMonth(month));

    let review: PenaltyReview | null = null;
    if (pending !== undefined) {
      const whole = state.kind === 'window';
      review =
        pending === null
          ? {
              title: 'Turn off the penalty for ' + name + '?',
              lines: [
                'No limit and no charges for all of ' + name + ', including the days already gone.',
                'You can set a new limit later this month. It would start that day and lock until ' + until + '.',
              ],
              confirmLabel: 'I understand, turn it off',
              confirm: store.confirmReview,
              cancel: store.cancelReview,
            }
          : {
              title: 'Lock in ' + settingText(pending) + '?',
              lines: [
                (whole ? 'For all of ' + name + ', ' : 'From today until ' + until + ', ') +
                  'every minute over ' +
                  limLabel(pending.limit) +
                  ' a day adds ' +
                  fmtMoney(pending.rate) +
                  '.',
                'You can’t change the limit or the fee, or turn it off, until ' +
                  until +
                  '. Next month starts with the same settings, and you’ll have the first 4 days to change them.',
                'This is paper money: Gauge keeps the tally, nothing is actually charged.',
              ],
              confirmLabel: 'I understand, lock it in',
              confirm: store.confirmReview,
              cancel: store.cancelReview,
            };
    }

    return {
      mode: state.kind,
      heading:
        state.kind === 'window'
          ? name + '’s limit'
          : state.kind === 'locked'
            ? 'This month’s limit'
            : 'Set a limit for ' + name,
      activeText: settingText(carried),
      status: statusLine(state),
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
      // In the window, keeping is its own button, so saving means a change.
      canSave: !rateError && !limitError && !(state.kind === 'window' && sameSetting(draft, carried)),
      saveLabel: state.kind === 'window' ? 'Change for ' + name : 'Start today',
      save: () => store.review(draft),
      keep: state.kind === 'window' && carried ? () => store.review(carried) : null,
      turnOff: state.kind === 'window' ? () => store.review(null) : null,
      lockNote:
        state.kind === 'window'
          ? 'Whatever you confirm applies to all of ' + name + ', then locks until ' + until + '.'
          : state.kind === 'open'
            ? 'Starts today and locks until ' + until + '. Paper money: nothing is actually charged.'
            : 'You can change it from the 1st to the 4th of next month.',
      review,
      goOverview: () => go('ov'),
    };
  }, [store, go]);
}

// --- History -------------------------------------------------------------------

export interface ChargeRow {
  label: string;
  detail: string;
  amount: string;
  over: boolean;
}

export interface ChargeMonth {
  title: string;
  total: string;
  rows: ChargeRow[];
}

export interface PenaltyHistoryViewModel {
  monthTotal: string;
  monthNote: string;
  allTime: string;
  allTimeNote: string;
  daysOver: string;
  minutesOver: string;
  months: ChargeMonth[];
  goOverview: () => void;
}

const rowFor = (d: Pick<ChargeDay, 'over' | 'limit' | 'charge'>, label: string): ChargeRow => ({
  label,
  detail: d.over > 0 ? fmtShort(d.over) + ' over ' + limLabel(d.limit) : 'Under ' + limLabel(d.limit),
  amount: d.charge > 0 ? fmtMoney(d.charge) : '—',
  over: d.charge > 0,
});

export function usePenaltyHistoryModel(): PenaltyHistoryViewModel {
  const plans = usePenaltyStore((s) => s.plans);
  const dataVersion = useAppsStore((s) => s.dataVersion);
  const go = useNavStore((s) => s.go);

  return useMemo(() => {
    const today = dayStamp();
    const month = monthOf(today);
    const ledger = chargeLedger(plans, today);
    const setting = settingOn(plans, today);
    const now = todayCharge(setting);
    const first = firstChargeDay(plans);

    // Newest month first, today (still running) at the top of its month.
    const byMonth = new Map<string, ChargeRow[]>();
    const totals = new Map<string, number>();
    if (setting) {
      byMonth.set(month, [rowFor({ ...now, limit: setting.limit }, 'Today, so far')]);
      totals.set(month, now.charge);
    }
    for (const d of ledger) {
      const m = monthOf(d.stamp);
      byMonth.set(m, [...(byMonth.get(m) ?? []), rowFor(d, d.label)]);
      totals.set(m, Math.round(((totals.get(m) ?? 0) + d.charge) * 100) / 100);
    }

    return {
      monthTotal: fmtMoney(totals.get(month) ?? 0),
      monthNote: monthName(month) + ' so far',
      allTime: fmtMoney(totalOf(ledger) + now.charge),
      allTimeNote: first ? 'since ' + longDay(first) : 'Nothing charged yet',
      daysOver: ledger.filter((d) => d.charge > 0).length + ' of ' + ledger.length,
      minutesOver: fmtShort(ledger.reduce((sum, d) => sum + d.over, 0)),
      months: [...byMonth.entries()].map(([m, rows]) => ({
        title: monthName(m) + ' ' + m.slice(0, 4),
        total: fmtMoney(totals.get(m) ?? 0),
        rows,
      })),
      goOverview: () => go('ov'),
    };
  }, [plans, go, dataVersion]);
}
