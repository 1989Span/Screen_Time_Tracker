import { LINK_BASE, appLinkFor, fromBase64Url, groupLink, readGroupLink, toBase64Url } from '../groupLink';
import { Group, Member, newMember } from '../groups';

const NOW = Date.UTC(2026, 8, 24, 20);

const me: Member = {
  ...newMember('me000000', 'Stewart', '2026-09-20'),
  sharedAt: NOW,
  days: { '2026-09-24': 194.4, '2026-09-23': 210.6, '2026-09-21': 0 },
  excludes: { 'com.spotify.music': 'Spotify' },
};
const alex: Member = {
  ...newMember('alex0000', 'Álex 🎧', '2026-09-21'),
  sharedAt: NOW - 3_600_000,
  days: { '2026-09-23': 120 },
  declines: ['com.spotify.music'],
};
const g: Group = { id: 'grp00000', name: 'Family ✨', created: '2026-09-20', members: [me, alex] };

/** A payload with arbitrary JSON, for feeding the validator bad input. */
const linkWith = (wire: unknown) => LINK_BASE + toBase64Url(JSON.stringify(wire));
const valid = () => ({
  v: 1,
  g: 'grp00000',
  n: 'G',
  c: '2026-09-20',
  f: 'me000000',
  m: [{ i: 'me000000', n: 'Me', j: '2026-09-20', t: NOW, e: '2026-09-24', d: [10, 20] }],
});

describe('group links', () => {
  it('round-trips a group, rounding minutes and keeping unicode names', () => {
    const got = readGroupLink(groupLink(g, me), NOW);
    expect(got).not.toBeNull();
    expect(got?.name).toBe('Family ✨');
    expect(got?.senderId).toBe('me000000');
    const byId = Object.fromEntries((got?.members ?? []).map((m) => [m.id, m]));
    expect(byId.me000000.days).toEqual({ '2026-09-24': 194, '2026-09-23': 211, '2026-09-21': 0 });
    expect(byId.me000000.excludes).toEqual({ 'com.spotify.music': 'Spotify' });
    expect(byId.alex0000.name).toBe('Álex 🎧');
    expect(byId.alex0000.declines).toEqual(['com.spotify.music']);
    expect(byId.alex0000.sharedAt).toBe(NOW - 3_600_000);
  });

  it('keeps links short enough for a text message', () => {
    expect(groupLink(g, me).length).toBeLessThan(600);
  });

  it('accepts the app form, and a whole pasted message', () => {
    const https = groupLink(g, me);
    expect(readGroupLink(appLinkFor(https) as string, NOW)?.id).toBe('grp00000');
    expect(readGroupLink(`Join my group!\n${https}\nsee you there`, NOW)?.id).toBe('grp00000');
  });

  it('rejects anything malformed', () => {
    const bad: unknown[] = [
      { ...valid(), v: 2 },
      { ...valid(), g: 'BAD ID' },
      { ...valid(), c: '2026-02-30' },
      { ...valid(), f: 'someone' },
      { ...valid(), n: '\u0000\u0007' },
      { ...valid(), m: [] },
      { ...valid(), m: [{ ...valid().m[0], d: [2000] }] },
      { ...valid(), m: [{ ...valid().m[0], d: [1.5] }] },
      { ...valid(), m: [{ ...valid().m[0], d: new Array(15).fill(1) }] },
      { ...valid(), m: [{ ...valid().m[0], t: NOW + 3 * 86_400_000 }] },
      { ...valid(), m: [{ ...valid().m[0], y: { 'bad package!': 'X' } }] },
      { ...valid(), m: [{ ...valid().m[0], x: [42] }] },
      { ...valid(), m: [valid().m[0], valid().m[0]] },
    ];
    for (const wire of bad) expect(readGroupLink(linkWith(wire), NOW)).toBeNull();
    expect(readGroupLink(LINK_BASE + 'not!base64', NOW)).toBeNull();
    expect(readGroupLink(LINK_BASE + toBase64Url('{not json'), NOW)).toBeNull();
    expect(readGroupLink(LINK_BASE + 'A'.repeat(20_000), NOW)).toBeNull();
    expect(readGroupLink('https://example.com/g/#abc', NOW)).toBeNull();
  });

  it('accepts the valid baseline those cases are built from', () => {
    expect(readGroupLink(linkWith(valid()), NOW)?.members[0].days).toEqual({ '2026-09-24': 10, '2026-09-23': 20 });
  });

  it('strips control and text-direction characters from names', () => {
    const wire = { ...valid(), n: 'Fam\u0000ily\u202e', m: [{ ...valid().m[0], n: '  Bo\u0007b  ' }] };
    const got = readGroupLink(linkWith(wire), NOW);
    expect(got?.members[0].name).toBe('Bob');
    expect(got?.name).toBe('Family');
  });

  it('encodes UTF-8 base64url both ways', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'Ωμέγα', '🎧 music', '{"x":1}'])
      expect(fromBase64Url(toBase64Url(s))).toBe(s);
    expect(toBase64Url('ÿþ')).not.toMatch(/[+/=]/);
  });
});
