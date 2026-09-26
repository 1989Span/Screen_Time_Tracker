// Group invite links.
//
//   https://1989span.github.io/Screen_Time_Tracker/g/#<payload>
//
// A link carries only what the invitee needs before joining: the group's invite
// code, its name, and who sent it. Everyone's numbers sync through the group
// server instead (sync/groupsApi.ts), and never travel in links.
//
// The payload sits after the "#", which browsers never send to a server, so the
// landing page (docs/g/index.html) never sees the invite code. The page only
// hands the payload to Gauge on the phone. Gauge also accepts
// gauge://g/<payload>, and a whole pasted message that contains either form.
//
// Anyone can craft a link, so the payload is validated strictly. A forged link
// can do no more than offer to join a group whose code the forger already holds.

import { NAME_MAX } from './groups';

export const LINK_BASE = 'https://1989span.github.io/Screen_Time_Tracker/g/#';
const APP_PREFIX = 'gauge://g/';
const MAX_PAYLOAD = 2_000;

/** Invite codes are 32 hex characters (see supabase/migrations). */
const CODE = /^[0-9a-f]{32}$/;
const PAYLOAD = /^[A-Za-z0-9_-]+$/;

interface WireInvite {
  v: 2;
  c: string; // invite code
  n: string; // group name
  f: string; // name of the member who sent it
}

export interface Invite {
  code: string;
  groupName: string;
  inviter: string;
}

/** The link to send someone so they can join. */
export function inviteLink(code: string, groupName: string, inviter: string): string {
  const wire: WireInvite = { v: 2, c: code, n: groupName, f: inviter };
  return LINK_BASE + toBase64Url(JSON.stringify(wire));
}

/**
 * Control and text-direction characters out, so a name can't break or reverse
 * the text around it; whitespace trimmed, length capped. Null if nothing is left.
 * Used on anything a link or another member's phone supplies.
 */
export function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;

  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return t.length === 0 ? null : t.slice(0, max);
}

/** The payload inside a pasted message or a link, or null if there isn't one. */
export function findPayload(text: string): string | null {
  const escaped = LINK_BASE.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const m = new RegExp('(?:' + escaped + '|gauge://g/)([A-Za-z0-9_-]+)').exec(text);
  return m ? m[1] : null;
}

/**
 * The invite a link describes, or null for anything that isn't a well-formed
 * Gauge invite. Accepts a bare link or a whole pasted message containing one.
 */
export function readInvite(text: string): Invite | null {
  const payload = findPayload(text);
  if (payload === null || payload.length > MAX_PAYLOAD || !PAYLOAD.test(payload)) return null;
  let wire: Partial<WireInvite>;
  try {
    wire = JSON.parse(fromBase64Url(payload)) as Partial<WireInvite>;
  } catch {
    return null;
  }
  if (typeof wire !== 'object' || wire === null || wire.v !== 2) return null;
  if (typeof wire.c !== 'string' || !CODE.test(wire.c)) return null;
  const groupName = cleanText(wire.n, NAME_MAX);
  const inviter = cleanText(wire.f, NAME_MAX);
  if (groupName === null || inviter === null) return null;
  return { code: wire.c, groupName, inviter };
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
