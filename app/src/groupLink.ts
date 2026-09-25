// Group links: how numbers get from one phone to another without a server.
//
//   https://1989span.github.io/Screen_Time_Tracker/g/#<payload>
//
// The payload is everything after the '#'. Browsers never send that part of a
// URL to the server, so the landing page (docs/g/index.html) never receives
// anyone's numbers. The page only hands the payload to Gauge on the phone. A
// link preview fetched by a messaging app doesn't carry it either. Gauge also
// accepts the same payload as gauge://g/<payload>, and a whole pasted message
// that contains either form.
//
// A link carries the group, the sender's latest numbers and everyone else the
// sender knows about. So one message to a group chat updates everyone, and a
// new member learns the whole roster from their invite.
//
// Anyone can craft a link, so everything is validated strictly and anything
// malformed is rejected outright. Links are not signed. A friend could hand-edit
// their own numbers, and nothing without a server could stop that. This is a
// game between people who trust each other, and the app says so.

import { dayStamp } from './clock';
import { Group, Member, NAME_MAX, SHARE_DAYS, shiftStamp } from './groups';
import { dayStampToDate } from './usage/ledger';

export const LINK_BASE = 'https://1989span.github.io/Screen_Time_Tracker/g/#';
const APP_PREFIX = 'gauge://g/';

/** Longest payload accepted. A 20-person group fits in well under a quarter of this. */
const MAX_PAYLOAD = 16_000;
const MAX_MEMBERS = 30;
const MAX_VOTES = 100;
/** Accept shares stamped up to this far in the future, to allow for clock drift. */
const FUTURE_SLACK_MS = 36 * 3_600_000;

interface WireMember {
  i: string; // id
  n: string; // name
  j: string; // joined, day stamp
  t: number; // when this member shared, ms
  e?: string; // the day d[0] is for
  d?: number[]; // minutes: d[k] is day e - k; -1 = not shared
  y?: Record<string, string>; // apps this member agrees to leave out: package -> label
  x?: string[]; // proposals this member declined
}

interface Wire {
  v: 1;
  g: string; // group id
  n: string; // group name
  c: string; // created, day stamp
  f: string; // who sent this link (a member id)
  m: WireMember[];
}

export interface ReceivedGroup {
  id: string;
  name: string;
  created: string;
  senderId: string;
  members: Member[];
}

// --- Encoding ----------------------------------------------------------------

/** Days as the wire's compact form: the latest day, then minutes counting back. */
function packDays(days: Record<string, number>): { e?: string; d?: number[] } {
  const stamps = Object.keys(days).sort();
  if (stamps.length === 0) return {};
  const e = stamps[stamps.length - 1];
  const d: number[] = [];
  for (let k = 0; k < SHARE_DAYS; k++) {
    const v = days[shiftStamp(e, -k)];
    d.push(v === undefined ? -1 : Math.max(0, Math.round(v)));
  }
  while (d.length > 0 && d[d.length - 1] === -1) d.pop();
  return { e, d };
}

function toWire(m: Member): WireMember {
  const w: WireMember = { i: m.id, n: m.name, j: m.joined, t: m.sharedAt, ...packDays(m.days) };
  if (Object.keys(m.excludes).length > 0) w.y = m.excludes;
  if (m.declines.length > 0) w.x = m.declines;
  return w;
}

/**
 * The link to share. `self` must already carry your fresh numbers and a
 * sharedAt of now. Everyone else goes out as last received.
 */
export function groupLink(g: Group, self: Member): string {
  const wire: Wire = {
    v: 1,
    g: g.id,
    n: g.name,
    c: g.created,
    f: self.id,
    m: [toWire(self), ...g.members.filter((m) => m.id !== self.id).map(toWire)],
  };
  return LINK_BASE + toBase64Url(JSON.stringify(wire));
}

// --- Decoding and validation ------------------------------------------------

const ID = /^[a-z0-9]{6,32}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}$/;
const PACKAGE = /^[A-Za-z0-9_.]{1,150}$/;
const PAYLOAD = /^[A-Za-z0-9_-]+$/;

const isStamp = (s: unknown): s is string =>
  typeof s === 'string' && STAMP.test(s) && dayStamp(dayStampToDate(s)) === s;

/** Control characters out, whitespace trimmed, length capped. Null if nothing is left. */
function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;

  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return t.length === 0 ? null : t.slice(0, max);
}

function readMember(w: unknown, now: number): Member | null {
  if (typeof w !== 'object' || w === null) return null;
  const m = w as Partial<WireMember>;
  if (typeof m.i !== 'string' || !ID.test(m.i)) return null;
  const name = cleanText(m.n, NAME_MAX);
  if (name === null || !isStamp(m.j)) return null;
  if (typeof m.t !== 'number' || !Number.isInteger(m.t) || m.t < 0 || m.t > now + FUTURE_SLACK_MS) return null;

  const days: Record<string, number> = {};
  if (m.d !== undefined || m.e !== undefined) {
    if (!isStamp(m.e) || !Array.isArray(m.d) || m.d.length > SHARE_DAYS) return null;
    for (let k = 0; k < m.d.length; k++) {
      const v = m.d[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < -1 || v > 1440) return null;
      if (v >= 0) days[shiftStamp(m.e, -k)] = v;
    }
  }

  const excludes: Record<string, string> = {};
  if (m.y !== undefined) {
    if (typeof m.y !== 'object' || m.y === null || Array.isArray(m.y)) return null;
    const entries = Object.entries(m.y);
    if (entries.length > MAX_VOTES) return null;
    for (const [app, label] of entries) {
      const clean = cleanText(label, 60);
      if (!PACKAGE.test(app) || clean === null) return null;
      excludes[app] = clean;
    }
  }

  let declines: string[] = [];
  if (m.x !== undefined) {
    if (!Array.isArray(m.x) || m.x.length > MAX_VOTES) return null;
    if (!m.x.every((a) => typeof a === 'string' && PACKAGE.test(a))) return null;
    declines = [...new Set(m.x as string[])];
  }

  return { id: m.i, name, joined: m.j, sharedAt: m.t, days, excludes, declines };
}

/** The payload inside a pasted message or a link, or null if there isn't one. */
export function findPayload(text: string): string | null {
  const escaped = LINK_BASE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const m = new RegExp('(?:' + escaped + '|gauge://g/)([A-Za-z0-9_-]+)').exec(text);
  return m ? m[1] : null;
}

/**
 * The group a link describes, or null for anything that isn't a well-formed
 * Gauge group link. Accepts a bare link, or a whole pasted message containing
 * one.
 */
export function readGroupLink(text: string, now: number = Date.now()): ReceivedGroup | null {
  const payload = findPayload(text);
  if (payload === null || payload.length > MAX_PAYLOAD || !PAYLOAD.test(payload)) return null;
  let wire: Partial<Wire>;
  try {
    wire = JSON.parse(fromBase64Url(payload)) as Partial<Wire>;
  } catch {
    return null;
  }
  if (typeof wire !== 'object' || wire === null || wire.v !== 1) return null;
  if (typeof wire.g !== 'string' || !ID.test(wire.g) || typeof wire.f !== 'string') return null;
  const name = cleanText(wire.n, NAME_MAX);
  if (name === null || !isStamp(wire.c)) return null;
  if (!Array.isArray(wire.m) || wire.m.length === 0 || wire.m.length > MAX_MEMBERS) return null;

  const members: Member[] = [];
  for (const w of wire.m) {
    const m = readMember(w, now);
    if (m === null) return null;
    members.push(m);
  }
  if (new Set(members.map((m) => m.id)).size !== members.length) return null;
  if (!members.some((m) => m.id === wire.f)) return null;
  return { id: wire.g, name, created: wire.c, senderId: wire.f, members };
}

/** The same payload as an app link, which the landing page opens Gauge with. */
export const appLinkFor = (httpsLink: string): string | null => {
  const p = findPayload(httpsLink);
  return p === null ? null : APP_PREFIX + p;
};

// --- Base64url over UTF-8 ----------------------------------------------------
// Written out here rather than relying on btoa/TextEncoder, whose availability
// differs between Hermes versions and the Node test runner.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function fromUtf8(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let c: number;
    let n: number;
    if (b < 0x80) [c, n] = [b, 1];
    else if (b >> 5 === 6) [c, n] = [b & 31, 2];
    else if (b >> 4 === 14) [c, n] = [b & 15, 3];
    else if (b >> 3 === 30) [c, n] = [b & 7, 4];
    else throw new Error('bad utf-8');
    if (i + n > bytes.length) throw new Error('bad utf-8');
    for (let k = 1; k < n; k++) {
      if (bytes[i + k] >> 6 !== 2) throw new Error('bad utf-8');
      c = (c << 6) | (bytes[i + k] & 63);
    }
    s += String.fromCodePoint(c);
    i += n;
  }
  return s;
}

export function toBase64Url(s: string): string {
  const b = utf8(s);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < b.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < b.length) out += ALPHABET[n & 63];
  }
  return out;
}

export function fromBase64Url(s: string): string {
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error('bad base64');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 255);
    }
  }
  return fromUtf8(bytes);
}
