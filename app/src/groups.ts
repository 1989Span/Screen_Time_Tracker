// Groups — demo data for accountability groups. Rankings use all categories
// (personal tracked toggles don't apply) minus any the group has excluded, and
// the daily point goes to the lowest full-day total; ties each get a point.
// Today is "so far" and not awarded until midnight.
//
// Excluding a category, or bringing one back, needs every member to agree.
// Either change is retroactive: points and streaks are recalculated as if the
// category had always been (or never been) excluded.
//
// Members only compete on days since they joined. Someone joining later leaves
// everyone's existing points and streaks untouched and starts at zero.

import { CATS, dayUsageAt } from './data';
import { checkDayRollover, onDayChange } from './clock';

export interface Member {
  id: string;
  name: string;
  color: string;
  joined: number; // days before today they joined; they compete on that day onward
  // Generator inputs, stored so a persisted member can be rebuilt. `day` is a
  // closure and does not survive JSON, so reviveMember() reattaches it from
  // these. Your own row ignores both and reads your real usage instead.
  seed: number;
  scale: number[];
  day: (idx: number) => number[];
}

export interface Group {
  id: string;
  name: string;
  created: number; // days before today the group was created
  members: Member[];
}

export interface Proposal {
  cat: string; // category id
  kind: 'exclude' | 'include';
  agreed: string[]; // member ids
}

export interface GroupRules {
  excluded: string[]; // category ids
  proposals: Proposal[];
}

// Per-category usage scale, in CATS order (Social, Video, Work, Messaging,
// Games, Music, Reading, Navigation).
export const YOU_ID = 'you';

const you = (joined: number): Member => ({
  id: YOU_ID,
  name: 'You',
  color: '#5980a6',
  joined,
  seed: 0,
  scale: [],
  // Your own row reads your real usage. Other members would need a backend: the
  // OS can only report this device, so there is nothing truthful to put here.
  day: (idx) => dayUsageAt(idx),
});

/** Everything about a member except the `day` closure — what actually persists. */
export type StoredMember = Omit<Member, 'day'>;
export type StoredGroup = Omit<Group, 'members'> & { members: StoredMember[] };

/** Reattach the usage generator that JSON dropped. */
export function reviveMember(m: StoredMember): Member {
  // Your own row reads real device usage; anyone else has none until a backend
  // provides it, so their history revives as zeros rather than invented numbers.
  return m.id === YOU_ID ? { ...m, day: dayUsageAt } : { ...m, day: () => CATS.map(() => 0) };
}

export function reviveGroup(g: StoredGroup): Group {
  return { ...g, members: g.members.map(reviveMember) };
}

/** Guards against a persisted payload written by an older build (or a corrupt
 *  one) reaching the UI as a member whose `day` would be undefined. */
export function isStoredGroup(v: unknown): v is StoredGroup {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Partial<StoredGroup>;
  if (typeof g.id !== 'string' || typeof g.name !== 'string' || typeof g.created !== 'number') return false;
  if (!Array.isArray(g.members) || g.members.length === 0) return false;
  return g.members.every(
    (m) =>
      typeof m?.id === 'string' &&
      typeof m?.name === 'string' &&
      typeof m?.color === 'string' &&
      typeof m?.joined === 'number' &&
      typeof m?.seed === 'number' &&
      Array.isArray(m?.scale)
  );
}

// No seeded groups. A group needs other real people, which needs a backend the
// app does not have yet, so the Groups tab shows its empty state rather than a
// cast of invented members with invented usage.
export const GROUPS: Group[] = [];

export const INITIAL_RULES: Record<string, GroupRules> = {};

// Contacts (simulated). A real build can't see other people's installed apps:
// it would hash contacts' phone numbers, match them server-side against
// registered accounts, push an in-app invite to matches, and text everyone else
// a download link carrying an invite code. `hasApp` stands in for that match.

export interface Contact {
  id: string;
  name: string;
  phone: string;
  hasApp: boolean;
  memberId?: string; // the demo group member this contact is, if any
}

// Real contacts would come from the address book with permission. Until then this
// is empty rather than a list of invented friends.
export const CONTACTS: Contact[] = [];

export interface Invite {
  contactId: string;
  via: 'app' | 'link'; // in-app notification, or text message with a download link
}

/** A group needs at least this many people. Pending invitees count toward it
 *  for a new group, since you can't create one without inviting someone. */
export const MIN_GROUP_SIZE = 2;

/** Search by name, or by number ignoring punctuation. Digits match from the
 *  start of the number (area code first); 4+ digits also match the local part. */
export function contactMatches(c: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '' || c.name.toLowerCase().indexOf(q) >= 0) return true;
  if (/[a-z]/.test(q)) return false;
  let digits = q.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1); // +1 country code
  if (digits === '') return false;
  const phone = c.phone.replace(/\D/g, '');
  return phone.startsWith(digits) || (digits.length >= 4 && phone.slice(3).startsWith(digits));
}

/** A new group starts with just you; invitees join when they accept. */
export function makeGroup(id: string, name: string): Group {
  return { id, name, created: 0, members: [you(0)] };
}

/** The member id a contact has (or would have) in a group. */
export const memberIdOf = (c: Contact) => c.memberId || c.id;

/** Adds a contact who accepted. Their usage stays empty until a backend can
 *  supply it - an invented profile would be worse than an honest zero. */
export function joinGroup(g: Group, c: Contact): Group {
  const member: Member = {
    id: memberIdOf(c),
    name: c.name,
    color: '#8a8f94',
    joined: 0,
    seed: 0,
    scale: [],
    day: () => CATS.map(() => 0),
  };
  return { ...g, members: g.members.concat([member]) };
}

/** Total of the categories that count, given the group's excluded ids. */
export function countedTotal(per: number[], excluded: string[]): number {
  return per.reduce((s, v, i) => s + (excluded.indexOf(CATS[i].id) >= 0 ? 0 : v), 0);
}

export interface MemberStats {
  member: Member;
  points: number;
  streak: number; // consecutive wins ending yesterday
  best: number;
}

export interface GroupStats {
  winnersByDay: string[][]; // index 0 = yesterday
  stats: MemberStats[];
}

// Keyed by group + roster + excluded set. Every entry is derived from usage
// "days before today", so the whole map is only valid for one calendar day.
// Bounded because a session can mint a new key on every rules change.
const STATS_CACHE_MAX = 48;
let _stats = new Map<string, GroupStats>();
onDayChange(() => {
  _stats = new Map();
});

export function groupStats(g: Group, excluded: string[]): GroupStats {
  checkDayRollover();
  const roster = g.members.map((m) => m.id + '@' + m.joined).join(',');
  const key = g.id + '|' + roster + '|' + excluded.slice().sort().join(',');
  const hit = _stats.get(key);
  if (hit) {
    // Refresh recency so the entries in active use survive eviction.
    _stats.delete(key);
    _stats.set(key, hit);
    return hit;
  }
  const winnersByDay: string[][] = [];
  const run: Record<string, number> = {};
  const stats = g.members.map((m) => ({ member: m, points: 0, streak: 0, best: 0 }));
  // Oldest settled day first so running streaks accumulate forward in time.
  for (let idx = g.created; idx >= 1; idx--) {
    // Only people who were members that day compete for its point.
    const present = g.members.filter((m) => m.joined >= idx);
    if (present.length < MIN_GROUP_SIZE) {
      winnersByDay.unshift([]);
      continue;
    }
    const totals = present.map((m) => Math.round(countedTotal(m.day(idx), excluded)));
    const low = Math.min(...totals);
    const winners = present.filter((m, i) => totals[i] === low).map((m) => m.id);
    winnersByDay.unshift(winners);
    stats.forEach((s) => {
      if (s.member.joined < idx) return;
      const won = winners.indexOf(s.member.id) >= 0;
      run[s.member.id] = won ? (run[s.member.id] || 0) + 1 : 0;
      if (won) s.points++;
      s.best = Math.max(s.best, run[s.member.id]);
    });
  }
  stats.forEach((s) => (s.streak = run[s.member.id] || 0));
  const result: GroupStats = { winnersByDay, stats };
  // Evict least-recently-used; Map preserves insertion order.
  if (_stats.size >= STATS_CACHE_MAX) {
    const oldest = _stats.keys().next();
    if (!oldest.done) _stats.delete(oldest.value);
  }
  _stats.set(key, result);
  return result;
}

/** A unanimous proposal takes effect and closes. Nothing settles until the
 *  group has at least MIN_GROUP_SIZE members, so one person can't decide alone. */
function settle(g: Group, rules: GroupRules, cat: string): GroupRules {
  if (g.members.length < MIN_GROUP_SIZE) return rules;
  const done = rules.proposals.find((p) => p.cat === cat && p.agreed.length === g.members.length);
  if (!done) return rules;
  // At least one category must stay tracked; the proposal stays open until
  // another category is brought back.
  if (done.kind === 'exclude' && rules.excluded.length + 1 >= CATS.length) return rules;
  return {
    excluded: done.kind === 'exclude' ? rules.excluded.concat([cat]) : rules.excluded.filter((c) => c !== cat),
    proposals: rules.proposals.filter((p) => p !== done),
  };
}

export function vote(g: Group, rules: GroupRules, cat: string, memberId: string): GroupRules {
  const proposals = rules.proposals.map((p) =>
    p.cat === cat && p.agreed.indexOf(memberId) < 0 ? { ...p, agreed: p.agreed.concat([memberId]) } : p
  );
  return settle(g, { ...rules, proposals }, cat);
}

/** Whether excluding `cat` could still leave a category tracked, counting
 *  other open exclude proposals as if they pass. */
export function canProposeExclude(rules: GroupRules, cat: string): boolean {
  const pending = rules.proposals.filter((p) => p.kind === 'exclude' && p.cat !== cat).length;
  return CATS.length - rules.excluded.length - pending > 1;
}

/** Proposing counts as agreeing. */
export function propose(g: Group, rules: GroupRules, cat: string, memberId: string): GroupRules {
  const kind = rules.excluded.indexOf(cat) >= 0 ? 'include' : 'exclude';
  if (kind === 'exclude' && !canProposeExclude(rules, cat)) return rules;
  return settle(g, { ...rules, proposals: rules.proposals.concat([{ cat, kind, agreed: [memberId] }]) }, cat);
}

/** Declining blocks unanimity, so the proposal closes. */
export function decline(rules: GroupRules, cat: string): GroupRules {
  return { ...rules, proposals: rules.proposals.filter((p) => p.cat !== cat) };
}

/** Withdrawing your agreement; the proposal closes once nobody supports it. */
export function withdraw(rules: GroupRules, cat: string, memberId: string): GroupRules {
  return {
    ...rules,
    proposals: rules.proposals
      .map((p) => (p.cat === cat ? { ...p, agreed: p.agreed.filter((id) => id !== memberId) } : p))
      .filter((p) => p.agreed.length > 0),
  };
}
