// View-model layer — mirrors the "turn 3" (m_*) branch of renderVals() in
// the original .dc.html, restricted to the final modern-pass screens:
// overview -> detail (breakdown) -> app timers list -> timer editor,
// plus the shared tracked-categories picker.

import { useMemo, useState } from 'react';
import {
  CATS,
  CCOL,
  DATES,
  DEFAULT_PENALTY,
  DEMO_PENALTY,
  N_DAYS,
  PENALTY_LIMIT_PRESETS,
  PRESETS,
  PenaltySetting,
  RANGE_LABEL,
  RATE_MAX,
  RATE_MIN,
  RATE_PRESETS,
  RangeId,
  UNLOCK_DATE,
  chargeFor,
  chargeHistory,
  dateAt,
  dayUsage,
  daysUntilUnlock,
  factFor,
  fmt,
  fmtDate,
  fmtMoney,
  fmtShort,
  fourteenDayAvg,
  limLabel,
  minutesOver,
  prevTotal,
  slice,
  trackedToday,
} from './data';
import {
  CONTACTS,
  Contact,
  GROUPS,
  Group,
  GroupRules,
  INITIAL_RULES,
  Invite,
  MIN_GROUP_SIZE,
  canProposeExclude,
  contactMatches,
  countedTotal,
  decline,
  groupStats,
  joinGroup,
  makeGroup,
  memberIdOf,
  propose,
  vote,
  withdraw,
} from './groups';

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
  | 'newGroup';

const GROUP_NAME_MAX = 30;
export type Tab = 'overview' | 'groups' | 'timers' | 'settings';

const TAB_OF: Record<View, Tab> = {
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
};

const TABS: { id: Tab; label: string; root: View }[] = [
  { id: 'overview', label: 'Overview', root: 'ov' },
  { id: 'groups', label: 'Groups', root: 'groups' },
  { id: 'timers', label: 'Timers', root: 'limits' },
  { id: 'settings', label: 'Settings', root: 'pick' },
];

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + s;
}

/** Competition ranking: equal values share a rank (1, 1, 3). */
function ranks(sorted: number[]): number[] {
  const out: number[] = [];
  sorted.forEach((v, i) => out.push(i > 0 && v === sorted[i - 1] ? out[i - 1] : i + 1));
  return out;
}

interface AppState {
  v3: View;
  r3: RangeId;
  sel3: number | null;
  tracked: string[];
  limits: Record<string, number>;
  limitCat: number | null;
  // Penalty limit: `penalty` applies today; `penaltyNext` is a saved change
  // that starts tomorrow (undefined = no change, null = turn off).
  penalty: PenaltySetting | null;
  penaltyNext: PenaltySetting | null | undefined;
  penDraft: PenaltySetting;
  penRateText: string;
  penLimitH: string;
  penLimitM: string;
  groupId: string;
  groups: Group[];
  groupRules: Record<string, GroupRules>;
  invites: Record<string, Invite[]>;
  // New-group draft
  ngName: string;
  ngTracked: string[];
  ngInvited: string[];
  ngQuery: string;
  // Group settings: invite-more draft and leave confirmation
  ivInvited: string[];
  ivQuery: string;
  leaveConfirm: boolean;
}

const sameSetting = (a: PenaltySetting | null, b: PenaltySetting | null) =>
  a === b || (a != null && b != null && a.limit === b.limit && a.rate === b.rate);

const settingText = (s: PenaltySetting | null) => (s ? limLabel(s.limit) + ' a day · ' + fmtMoney(s.rate) + '/min' : 'Off');

function parseRate(text: string): number | null {
  const v = parseFloat(text.replace(/[$,\s]/g, ''));
  if (!isFinite(v) || v < RATE_MIN || v > RATE_MAX) return null;
  return Math.round(v * 100) / 100;
}

/** Custom limit from hour/minute fields; an empty field counts as 0. */
function parseLimit(h: string, m: string): number | null {
  if (!/^\d{0,2}$/.test(h) || !/^\d{0,2}$/.test(m)) return null;
  const hv = Number(h || 0);
  const mv = Number(m || 0);
  if (hv > 23 || mv > 59 || hv * 60 + mv < 1) return null;
  return hv * 60 + mv;
}

const RANGE_IDS: RangeId[] = ['day', 'week', 'month', 'year'];
const PREV_NAME: Record<RangeId, string> = { day: 'yesterday', week: 'last week', month: 'last month', year: 'last year' };

function limState(li: number, limits: Record<string, number>, todayPer: number[]) {
  const lim = limits[CATS[li].id];
  const used = todayPer[li];
  const over = lim != null && used >= lim;
  return {
    lim,
    used,
    over,
    text: lim == null ? 'No limit' : over ? 'Limit reached' : limLabel(Math.round(lim - used)) + ' left',
    bg: lim == null ? 'rgba(29,31,32,0.07)' : over ? 'rgba(181,87,107,0.15)' : 'rgba(79,140,123,0.15)',
    fg: lim == null ? 'rgba(29,31,32,0.52)' : over ? '#8e3f52' : '#2f6355',
  };
}

export function useScreenTimeModel() {
  const [state, setState] = useState<AppState>({
    v3: 'ov',
    r3: 'week',
    sel3: null,
    tracked: CATS.map((c) => c.id),
    limits: {},
    limitCat: null,
    penalty: DEMO_PENALTY,
    penaltyNext: undefined,
    penDraft: DEMO_PENALTY,
    penRateText: '',
    penLimitH: '',
    penLimitM: '',
    groupId: GROUPS[0].id,
    groups: GROUPS,
    groupRules: INITIAL_RULES,
    invites: {},
    ngName: '',
    ngTracked: CATS.map((c) => c.id),
    ngInvited: [],
    ngQuery: '',
    ivInvited: [],
    ivQuery: '',
    leaveConfirm: false,
  });

  const patch = (p: Partial<AppState>) => setState((s) => ({ ...s, ...p }));

  return useMemo(() => {
    const st = state;
    const tr = CATS.map((c) => st.tracked.indexOf(c.id) >= 0);
    const r3 = st.r3;
    const m = slice(r3, st.sel3, tr);
    const mPrev = prevTotal(r3, tr);
    const mDiff = m.total - mPrev;
    const mPct = Math.round((Math.abs(mDiff) / Math.max(1, mPrev)) * 100);
    const mSetSel = (i: number) => patch({ sel3: st.sel3 === i ? null : i });

    const mOv = RANGE_IDS.map((id) => {
      const sl = slice(id, null, tr);
      return {
        id,
        label: RANGE_LABEL[id],
        dates: DATES[id],
        total: fmt(sl.total),
        fact: factFor(id, sl.total),
        avg: id === 'day' ? 'so far today' : fmtShort(sl.total / N_DAYS[id]) + '/day',
        more: sl.rows.length > 3 ? '+' + (sl.rows.length - 3) + ' more' : '',
        top: sl.rows.slice(0, 3),
        comp: sl.order.map((ci) => ({ w: (sl.scoped[ci] / Math.max(1, sl.total)) * 100, color: CCOL[ci] })),
        onPress: () => patch({ v3: 'detail', r3: id, sel3: null }),
      };
    });

    const mStacks = m.bk.map((b, i) => {
      const segs = m.order
        .map((ci) => ({ h: Math.max(0, (b.per[ci] / m.max) * 164), color: CCOL[ci] }))
        .filter((s) => s.h > 0.6)
        .reverse();
      return {
        segs: segs.map((s, k) => ({ ...s, topRadius: k === 0 })),
        tick: m.bk.length > 12 && i % 5 !== 0 && i !== m.bk.length - 1 ? '' : b.tick,
        dim: !(m.sel == null || m.sel === i),
        active: m.sel === i,
        onPress: () => mSetSel(i),
      };
    });

    const todayPer = dayUsage();
    const openLimit = (i: number) => patch({ v3: 'limit', limitCat: i });

    const mLimits = CATS.map((c, i) => {
      const s = limState(i, st.limits, todayPer);
      return {
        id: c.id,
        name: c.name,
        color: CCOL[i],
        used: fmtShort(todayPer[i]) + ' today',
        limStr: s.lim == null ? 'Off' : limLabel(s.lim),
        text: s.text,
        bg: s.bg,
        fg: s.fg,
        pct: s.lim == null ? 0 : Math.min(100, (s.used / s.lim) * 100),
        barColor: s.over ? '#b5576b' : CCOL[i],
        onPress: () => openLimit(i),
      };
    });

    const li = st.limitCat != null ? st.limitCat : 0;
    const lSt = limState(li, st.limits, todayPer);

    const mRowsLim = m.rows.map((r) => {
      const s = limState(r.ci, st.limits, todayPer);
      return {
        ...r,
        limChip: s.lim == null ? 'Set limit' : limLabel(s.lim) + '/day',
        limBg: s.lim == null ? 'rgba(29,31,32,0.06)' : s.bg,
        limFg: s.lim == null ? 'rgba(29,31,32,0.50)' : s.fg,
        onPress: () => openLimit(r.ci),
      };
    });

    const pickRows = CATS.map((c, i) => {
      const on = st.tracked.indexOf(c.id) >= 0;
      const avgMin = fourteenDayAvg(i);
      return {
        id: c.id,
        name: c.name,
        avg: fmtShort(avgMin) + '/day',
        color: CCOL[i],
        on,
        onPress: () =>
          patch({ tracked: on ? st.tracked.filter((x) => x !== c.id) : st.tracked.concat([c.id]) }),
      };
    });

    // Penalty limit
    const pen = st.penalty;
    const next = st.penaltyNext === undefined ? pen : st.penaltyNext;
    const history = chargeHistory();
    const locked = history.length ? history[0].balance : 0;
    const usedToday = trackedToday(tr);
    const overToday = pen ? minutesOver(usedToday, pen.limit) : 0;
    const chargeToday = pen ? chargeFor(usedToday, pen) : 0;
    const unlockDate = fmtDate(UNLOCK_DATE);
    const penState =
      pen == null
        ? { text: 'Off', bg: 'rgba(29,31,32,0.07)', fg: 'rgba(29,31,32,0.52)' }
        : overToday > 0
        ? { text: fmtShort(overToday) + ' over', bg: 'rgba(181,87,107,0.15)', fg: '#8e3f52' }
        : { text: fmtShort(pen.limit - usedToday) + ' left', bg: 'rgba(79,140,123,0.15)', fg: '#2f6355' };
    const pendingText = st.penaltyNext === undefined ? '' : 'From tomorrow: ' + settingText(st.penaltyNext);

    const draft = st.penDraft;
    const customRate = st.penRateText ? parseRate(st.penRateText) : null;
    const rateError = st.penRateText !== '' && customRate == null;
    const limitCustom = st.penLimitH !== '' || st.penLimitM !== '';
    const limitError = limitCustom && parseLimit(st.penLimitH, st.penLimitM) == null;
    const setLimitFields = (h: string, m: string) => {
      const v = parseLimit(h, m);
      patch(v != null ? { penLimitH: h, penLimitM: m, penDraft: { ...draft, limit: v } } : { penLimitH: h, penLimitM: m });
    };
    const openPenalty = () => {
      const d = next || DEFAULT_PENALTY;
      const presetLimit = PENALTY_LIMIT_PRESETS.indexOf(d.limit) >= 0;
      patch({
        v3: 'penalty',
        penDraft: d,
        penRateText: RATE_PRESETS.indexOf(d.rate) >= 0 ? '' : d.rate.toFixed(2),
        penLimitH: presetLimit ? '' : String(Math.floor(d.limit / 60)),
        penLimitM: presetLimit ? '' : String(d.limit % 60),
      });
    };

    const penaltyModel = {
      on: pen != null,
      stateText: penState.text,
      stateBg: penState.bg,
      stateFg: penState.fg,
      used: fmtShort(usedToday),
      limitText: pen ? 'of ' + limLabel(pen.limit) + ' limit' : 'No limit today',
      pct: pen ? Math.min(100, (usedToday / pen.limit) * 100) : 0,
      barColor: overToday > 0 ? '#b5576b' : '#4f8c7b',
      chargeToday: fmtMoney(chargeToday),
      chargeNote: pen ? fmtMoney(pen.rate) + '/min · settles at midnight' : 'No charge today',
      locked: fmtMoney(locked),
      lockedNote: 'Locked until ' + unlockDate,
      pendingText,
      openSettings: openPenalty,
      openHistory: () => patch({ v3: 'history' }),
    };

    const penaltyEditor = {
      activeText: settingText(pen),
      pendingText,
      undoPending: () => patch({ penaltyNext: undefined }),
      limitPresets: PENALTY_LIMIT_PRESETS.map((v) => ({
        v,
        label: limLabel(v),
        active: !limitCustom && draft.limit === v,
        onPress: () => patch({ penDraft: { ...draft, limit: v }, penLimitH: '', penLimitM: '' }),
      })),
      limitH: st.penLimitH,
      limitM: st.penLimitM,
      setLimitH: (t: string) => setLimitFields(t.replace(/\D/g, ''), st.penLimitM),
      setLimitM: (t: string) => setLimitFields(st.penLimitH, t.replace(/\D/g, '')),
      limitError: limitError ? 'Enter up to 23 hours and 59 minutes' : '',
      ratePresets: RATE_PRESETS.map((v) => ({
        v,
        label: v < 1 ? Math.round(v * 100) + '¢' : '$' + v,
        active: st.penRateText === '' && draft.rate === v,
        onPress: () => patch({ penDraft: { ...draft, rate: v }, penRateText: '' }),
      })),
      rateText: st.penRateText,
      rateError: rateError ? 'Enter an amount from ' + fmtMoney(RATE_MIN) + ' to ' + fmtMoney(RATE_MAX) : '',
      setRateText: (t: string) => {
        const v = parseRate(t);
        patch(v != null ? { penRateText: t, penDraft: { ...draft, rate: v } } : { penRateText: t });
      },
      summary: limLabel(draft.limit) + ' a day, then ' + fmtMoney(draft.rate) + ' for every minute over',
      canSave: !rateError && !limitError && !sameSetting(draft, next),
      save: () => patch({ penaltyNext: sameSetting(draft, pen) ? undefined : { ...draft } }),
      canRemove: next != null,
      remove: () => patch({ penaltyNext: pen == null ? undefined : null }),
      lockNote: 'Charges settle at midnight and stay locked until ' + unlockDate + '. Changes start tomorrow.',
    };

    const penaltyHistory = {
      locked: fmtMoney(locked),
      unlockText: 'Unlocks ' + unlockDate + ' · ' + daysUntilUnlock() + ' days to go',
      daysOver: history.filter((d) => d.charge > 0).length + ' of ' + history.length,
      minutesOver: fmtShort(history.reduce((s, d) => s + d.over, 0)),
      today: pen
        ? {
            detail: overToday > 0 ? fmtShort(overToday) + ' over ' + limLabel(pen.limit) : 'Under ' + limLabel(pen.limit),
            amount: fmtMoney(chargeToday),
          }
        : null,
      rows: history.map((d) => ({
        label: d.label,
        detail: d.over > 0 ? fmtShort(d.over) + ' over ' + limLabel(d.limit) : 'Under ' + limLabel(d.limit),
        amount: d.charge > 0 ? fmtMoney(d.charge) : '—',
        balance: fmtMoney(d.balance),
        over: d.charge > 0,
      })),
    };

    // Groups
    const toInvite = (c: Contact): Invite => ({ contactId: c.id, via: c.hasApp ? 'app' : 'link' });

    /** Contact list with search and multi-select. `blocked` returns a reason a
     *  contact can't be picked (e.g. already a member), or '' if they can. */
    function contactPicker(
      selected: string[],
      query: string,
      set: (ids: string[], query: string) => void,
      blocked: (c: Contact) => string
    ) {
      const chosen = CONTACTS.filter((c) => selected.indexOf(c.id) >= 0);
      const nOnApp = chosen.filter((c) => c.hasApp).length;
      const nLink = chosen.length - nOnApp;
      return {
        query,
        setQuery: (t: string) => set(selected, t),
        contacts: CONTACTS.filter((c) => contactMatches(c, query)).map((c) => {
          const on = selected.indexOf(c.id) >= 0;
          const reason = blocked(c);
          return {
            id: c.id,
            name: c.name,
            initial: c.name[0],
            hasApp: c.hasApp,
            via: reason || (c.hasApp ? 'On the app · gets an in-app invite' : 'Not on the app · gets a download link by text'),
            on,
            disabled: reason !== '',
            onPress: reason ? undefined : () => set(on ? selected.filter((x) => x !== c.id) : selected.concat([c.id]), query),
          };
        }),
        summary:
          chosen.length === 0
            ? 'Nobody selected yet'
            : [nOnApp ? nOnApp + ' in-app invite' + (nOnApp > 1 ? 's' : '') : '', nLink ? nLink + ' download link' + (nLink > 1 ? 's' : '') : '']
                .filter(Boolean)
                .join(' · '),
        chosen,
      };
    }

    const openNewGroup = () => patch({ v3: 'newGroup', ngName: '', ngTracked: CATS.map((c) => c.id), ngInvited: [], ngQuery: '' });

    function buildGroup(grp: Group) {
      const rules = st.groupRules[grp.id];
      const excl = rules.excluded;
      const invites = st.invites[grp.id] || [];
      const setRules = (r: GroupRules) => patch({ groupRules: { ...st.groupRules, [grp.id]: r } });
      const gs = groupStats(grp, excl);
      const n = grp.members.length;
      const catNames = (ids: string[]) =>
        CATS.filter((c) => ids.indexOf(c.id) >= 0)
          .map((c) => c.name)
          .join(', ');
      const needsYou = rules.proposals.filter((p) => p.agreed.indexOf('you') < 0).length;
      const rulesLine = excl.length ? 'Not tracked: ' + catNames(excl) : 'All categories tracked';
      const rulesNote = needsYou ? needsYou + (needsYou === 1 ? ' proposal needs' : ' proposals need') + ' your vote' : '';
      const todayRows = grp.members
        .map((mem) => ({ mem, per: mem.day(0), total: Math.round(countedTotal(mem.day(0), excl)) }))
        .sort((a, b) => a.total - b.total || a.mem.name.localeCompare(b.mem.name));
      const todayRanks = ranks(todayRows.map((r) => r.total));
      const todayMax = Math.max(1, ...todayRows.map((r) => r.total));
      const yourTodayRank = todayRanks[todayRows.findIndex((r) => r.mem.id === 'you')];
      const nameOf = (id: string) => grp.members.find((mem) => mem.id === id)!.name;
      const yWinners = gs.winnersByDay[0] || [];
      const yTotal = yWinners.length ? Math.round(countedTotal(grp.members.find((mem) => mem.id === yWinners[0])!.day(1), excl)) : 0;
      const board = gs.stats.slice().sort((a, b) => b.points - a.points || a.member.name.localeCompare(b.member.name));
      const boardRanks = ranks(board.map((s) => s.points));

      const page = {
        name: grp.name,
        summary: 'You’re ' + ordinal(yourTodayRank) + ' of ' + n + ' today',
        since: n + (n === 1 ? ' member' : ' members') + ' · since ' + fmtDate(dateAt(grp.created)),
        today: todayRows.map((r, i) => ({
          id: r.mem.id,
          rank: todayRanks[i],
          name: r.mem.name,
          initial: r.mem.name[0],
          color: r.mem.color,
          you: r.mem.id === 'you',
          total: fmtShort(r.total),
          pct: Math.max(2, (r.total / todayMax) * 100),
          top: CATS.map((c, ci) => ci)
            .filter((ci) => excl.indexOf(CATS[ci].id) < 0)
            .sort((a, b) => r.per[b] - r.per[a])
            .slice(0, 3)
            .map((ci) => ({ name: CATS[ci].name, time: fmtShort(r.per[ci]), color: CCOL[ci] })),
        })),
        yesterday: yWinners.length
          ? yWinners.map(nameOf).join(' & ') + (yWinners.length > 1 ? ' tied for' : ' won') + ' yesterday’s point with ' + fmtShort(yTotal)
          : '',
        board: board.map((s, i) => ({
          id: s.member.id,
          rank: boardRanks[i],
          name: s.member.name,
          initial: s.member.name[0],
          color: s.member.color,
          you: s.member.id === 'you',
          points: s.points + (s.points === 1 ? ' pt' : ' pts'),
          streak: s.streak > 0 ? s.streak + '-day streak' : '',
          best: s.member.joined === 0 && grp.created > 0 ? 'Joined today · first point at midnight' : 'Best run ' + s.best,
        })),
        boardNote: gs.winnersByDay.length ? gs.winnersByDay.length + ' days played' : 'First point awarded at midnight',
        settingsNote: rulesNote,
        openSettings: () => patch({ v3: 'groupSettings', leaveConfirm: false }),
        pending: invites.map((inv) => {
          const c = CONTACTS.find((x) => x.id === inv.contactId)!;
          return {
            id: c.id,
            name: c.name,
            initial: c.name[0],
            status: inv.via === 'app' ? 'In-app invite sent' : 'Download link texted to ' + c.phone,
            // Cancelling can't take the group below the minimum size.
            cancel:
              n + invites.length > MIN_GROUP_SIZE
                ? () => patch({ invites: { ...st.invites, [grp.id]: invites.filter((x) => x !== inv) } })
                : undefined,
            // Demo only: stands in for the invitee accepting on their own phone.
            accept: () =>
              patch({
                groups: st.groups.map((x) => (x.id === grp.id ? joinGroup(x, c) : x)),
                invites: { ...st.invites, [grp.id]: invites.filter((x) => x !== inv) },
              }),
          };
        }),
        pendingNote:
          n + invites.length > MIN_GROUP_SIZE ? 'They join when they accept' : 'A group needs at least ' + MIN_GROUP_SIZE + ' people',
      };

      const memberVotes = (agreed: string[]) =>
        grp.members.map((mem) => ({ id: mem.id, initial: mem.name[0], color: mem.color, agreed: agreed.indexOf(mem.id) >= 0 }));

      const rulesModel = {
        name: grp.name,
        excluded: CATS.map((c, ci) => ({ c, ci }))
          .filter(({ c }) => excl.indexOf(c.id) >= 0)
          .map(({ c, ci }) => ({ id: c.id, name: c.name, color: CCOL[ci] })),
        proposals: rules.proposals.map((p) => {
          const ci = CATS.findIndex((c) => c.id === p.cat);
          const youAgreed = p.agreed.indexOf('you') >= 0;
          const waiting = grp.members.filter((mem) => p.agreed.indexOf(mem.id) < 0).map((mem) => mem.name);
          return {
            id: p.cat,
            title: (p.kind === 'exclude' ? 'Stop tracking ' : 'Track again: ') + CATS[ci].name,
            color: CCOL[ci],
            progress: p.agreed.length + ' of ' + n + ' agreed',
            waiting: n < MIN_GROUP_SIZE ? 'Takes effect once invitees join and agree' : 'Waiting on ' + waiting.join(', '),
            votes: memberVotes(p.agreed),
            youAgreed,
            agree: () => setRules(vote(grp, rules, p.cat, 'you')),
            decline: () => setRules(decline(rules, p.cat)),
            withdraw: () => setRules(withdraw(rules, p.cat, 'you')),
          };
        }),
        categories: CATS.map((c, ci) => {
          const open = rules.proposals.some((p) => p.cat === c.id);
          const off = excl.indexOf(c.id) >= 0;
          const lastTracked = !off && !open && !canProposeExclude(rules, c.id);
          return {
            id: c.id,
            name: c.name,
            color: CCOL[ci],
            off,
            open,
            action: open ? 'Vote open' : off ? 'Propose tracking' : lastTracked ? 'Must track at least one' : 'Propose not tracking',
            onPress: open || lastTracked ? undefined : () => setRules(propose(grp, rules, c.id, 'you')),
          };
        }),
      };

      const settings = {
        name: grp.name,
        members: grp.members.map((mem) => ({ id: mem.id, name: mem.name, initial: mem.name[0], color: mem.color })),
        memberLine: n + (n === 1 ? ' member' : ' members') + (invites.length ? ' · ' + invites.length + ' invite' + (invites.length > 1 ? 's' : '') + ' pending' : ''),
        inviteNote: 'Any member can invite people',
        rulesLine,
        rulesNote,
        openInvite: () => patch({ v3: 'groupInvite', ivInvited: [], ivQuery: '' }),
        openRules: () => patch({ v3: 'groupRules' }),
        leaveConfirm: st.leaveConfirm,
        leaveText:
          n === 1
            ? 'You’re the only member, so leaving deletes ' + grp.name + ' and cancels its pending invites.'
            : n - 1 < MIN_GROUP_SIZE
            ? 'A group needs at least ' + MIN_GROUP_SIZE + ' people, so leaving ends ' + grp.name + ' for ' +
              grp.members.filter((mem) => mem.id !== 'you').map((mem) => mem.name).join(', ') + ' too.'
            : 'You’ll drop out of ' + grp.name + '’s rankings and points. The other ' + (n - 1) + ' stay in the group.',
        askLeave: () => patch({ leaveConfirm: true }),
        cancelLeave: () => patch({ leaveConfirm: false }),
        leave: () => {
          const rest = st.groups.filter((x) => x.id !== grp.id);
          const inv = { ...st.invites };
          delete inv[grp.id];
          patch({ groups: rest, invites: inv, groupId: rest.length ? rest[0].id : '', v3: 'groups', leaveConfirm: false });
        },
      };

      const memberIds = grp.members.map((mem) => mem.id);
      const picker = contactPicker(
        st.ivInvited,
        st.ivQuery,
        (ids, query) => patch({ ivInvited: ids, ivQuery: query }),
        (c) =>
          memberIds.indexOf(memberIdOf(c)) >= 0
            ? 'Already in ' + grp.name
            : invites.some((x) => x.contactId === c.id)
            ? 'Invite already pending'
            : ''
      );
      const invite = {
        name: grp.name,
        picker,
        canSend: picker.chosen.length > 0,
        send: () =>
          patch({ invites: { ...st.invites, [grp.id]: invites.concat(picker.chosen.map(toInvite)) }, ivInvited: [], ivQuery: '', v3: 'groupSettings' }),
      };

      return { page, rules: rulesModel, settings, invite };
    }

    const currentGroup = st.groups.find((x) => x.id === st.groupId) || st.groups[0];
    const gm = currentGroup ? buildGroup(currentGroup) : null;

    const groupsModel = {
      empty: gm == null,
      openNewGroup,
      tabs: st.groups.map((x) => ({
        id: x.id,
        label: x.name + ' · ' + x.members.length,
        active: currentGroup != null && x.id === currentGroup.id,
        onPress: () => patch({ groupId: x.id }),
      })),
      ...(gm ? gm.page : {}),
    };

    // New group
    const ngName = st.ngName.trim();
    const nameTaken = st.groups.some((x) => x.name.toLowerCase() === ngName.toLowerCase());
    const ngInvitedContacts = CONTACTS.filter((c) => st.ngInvited.indexOf(c.id) >= 0);
    const ngError =
      ngName === ''
        ? 'Give the group a name'
        : nameTaken
        ? 'You already have a group with that name'
        : st.ngTracked.length === 0
        ? 'Track at least one category'
        : ngInvitedContacts.length + 1 < MIN_GROUP_SIZE
        ? 'A group needs at least ' + MIN_GROUP_SIZE + ' people, so invite at least one'
        : '';

    const newGroupModel = {
      name: st.ngName,
      nameMax: GROUP_NAME_MAX,
      setName: (t: string) => patch({ ngName: t.slice(0, GROUP_NAME_MAX) }),
      categories: CATS.map((c, ci) => {
        const on = st.ngTracked.indexOf(c.id) >= 0;
        return {
          id: c.id,
          name: c.name,
          color: CCOL[ci],
          on,
          onPress: () => patch({ ngTracked: on ? st.ngTracked.filter((x) => x !== c.id) : st.ngTracked.concat([c.id]) }),
        };
      }),
      trackedLabel: st.ngTracked.length + ' of ' + CATS.length + ' tracked',
      picker: contactPicker(st.ngInvited, st.ngQuery, (ids, query) => patch({ ngInvited: ids, ngQuery: query }), () => ''),
      error: ngError,
      canCreate: ngError === '',
      create: () => {
        const id = 'g-' + Date.now();
        const g = makeGroup(id, ngName);
        patch({
          groups: st.groups.concat([g]),
          groupRules: {
            ...st.groupRules,
            [id]: { excluded: CATS.filter((c) => st.ngTracked.indexOf(c.id) < 0).map((c) => c.id), proposals: [] },
          },
          invites: { ...st.invites, [id]: ngInvitedContacts.map(toInvite) },
          groupId: id,
          v3: 'groups',
        });
      },
    };

    const tab = TAB_OF[st.v3];

    return {
      view: st.v3,
      tabs: TABS.map((t) => ({ id: t.id, label: t.label, active: t.id === tab, onPress: () => patch({ v3: t.root, sel3: null }) })),
      groups: groupsModel,
      groupRules: gm && gm.rules,
      groupSettings: gm && gm.settings,
      groupInvite: gm && gm.invite,
      newGroup: newGroupModel,
      backToGroups: () => patch({ v3: 'groups', leaveConfirm: false }),
      backToGroupSettings: () => patch({ v3: 'groupSettings' }),
      penalty: penaltyModel,
      penaltyEditor,
      penaltyHistory,
      goOverview: () => patch({ v3: 'ov', sel3: null }),
      backToLimits: () => patch({ v3: 'limits' }),
      allLabel: st.tracked.length === CATS.length ? 'Clear all' : 'Select all',
      toggleAll: () => patch({ tracked: st.tracked.length === CATS.length ? [] : CATS.map((c) => c.id) }),
      pickRows,

      overview: { cards: mOv },

      detail: {
        r3,
        ranges: RANGE_IDS.map((id) => ({
          id,
          label: RANGE_LABEL[id],
          active: r3 === id,
          onPress: () => patch({ r3: id, sel3: null }),
        })),
        fact: factFor(r3, m.total),
        scope: m.sel != null ? m.bk[m.sel].label : DATES[r3],
        total: fmt(m.total),
        avg: fmtShort(m.total / (m.sel != null ? 1 : N_DAYS[r3])),
        avgLabel: m.sel != null ? 'in this slice' : 'daily average',
        delta:
          m.sel != null
            ? 'Tap the bar again to clear'
            : Math.abs(mDiff) < 1
            ? 'Same as ' + PREV_NAME[r3]
            : (mDiff > 0 ? '↑ ' : '↓ ') + mPct + '% vs ' + PREV_NAME[r3],
        deltaPositive: mDiff > 0,
        deltaNeutral: m.sel != null,
        comp: m.order.map((ci) => ({ w: (m.scoped[ci] / Math.max(1, m.total)) * 100, color: CCOL[ci] })),
        stacks: mStacks,
        rows: mRowsLim,
        axisNote: { day: 'By hour', week: 'By day', month: 'By day', year: 'By month' }[r3],
        count: m.rows.length + ' categories',
        gap: r3 === 'month' ? 2 : r3 === 'day' ? 3 : 7,
      },

      limits: { list: mLimits },

      limitEditor: {
        name: CATS[li].name,
        color: CCOL[li],
        used: fmtShort(todayPer[li]),
        limitText: lSt.lim == null ? 'No limit set' : limLabel(lSt.lim) + ' a day',
        pct: lSt.lim == null ? 0 : Math.min(100, (todayPer[li] / lSt.lim) * 100),
        barColor: lSt.over ? '#b5576b' : CCOL[li],
        stateText: lSt.text,
        stateBg: lSt.bg,
        stateFg: lSt.fg,
        hint:
          lSt.lim == null
            ? 'Pick a daily budget. The app pauses when you hit it, and resets at midnight.'
            : 'Pauses ' + CATS[li].name.toLowerCase() + ' apps for the rest of the day once you hit it.',
        presets: PRESETS.map((v) => ({
          v,
          label: limLabel(v),
          active: lSt.lim === v,
          onPress: () => patch({ limits: { ...st.limits, [CATS[li].id]: v } }),
        })),
        hasLimit: lSt.lim != null,
        clear: () => {
          const n = { ...st.limits };
          delete n[CATS[li].id];
          patch({ limits: n });
        },
      },
    };
  }, [state]);
}
