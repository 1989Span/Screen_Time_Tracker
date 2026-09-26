import { LINK_BASE, appLinkFor, fromBase64Url, inviteLink, readInvite, toBase64Url } from '../groupLink';

const CODE = '0123456789abcdef0123456789abcdef';

/** A payload with arbitrary JSON, for feeding the validator bad input. */
const linkWith = (wire: unknown) => LINK_BASE + toBase64Url(JSON.stringify(wire));
const valid = () => ({ v: 2, c: CODE, n: 'Family', f: 'Alex' });

describe('invite links', () => {
  it('round-trip the code, group name and inviter, unicode included', () => {
    expect(readInvite(inviteLink(CODE, 'Family ✨', 'Álex 🎧'))).toEqual({
      code: CODE,
      groupName: 'Family ✨',
      inviter: 'Álex 🎧',
    });
  });

  it('carry no numbers, and stay short', () => {
    const link = inviteLink(CODE, 'Family', 'Alex');
    expect(link.length).toBeLessThan(200);
    expect(JSON.parse(fromBase64Url(link.slice(LINK_BASE.length)))).toEqual(valid());
  });

  it('are read from the app form, or from a whole pasted message', () => {
    const https = inviteLink(CODE, 'Family', 'Alex');
    expect(readInvite(appLinkFor(https) as string)?.code).toBe(CODE);
    expect(readInvite(`Join us!\n${https}\nsee you there`)?.code).toBe(CODE);
  });

  it('reject anything malformed', () => {
    const bad: unknown[] = [
      { ...valid(), v: 1 },
      { ...valid(), c: 'not-a-code' },
      { ...valid(), c: CODE.toUpperCase() },
      { ...valid(), c: CODE + '0' },
      { ...valid(), n: '' },
      { ...valid(), n: '\u0000\u0007' },
      { ...valid(), f: 42 },
      [],
      null,
    ];
    for (const wire of bad) expect(readInvite(linkWith(wire))).toBeNull();
    expect(readInvite(LINK_BASE + 'not!base64')).toBeNull();
    expect(readInvite(LINK_BASE + toBase64Url('{not json'))).toBeNull();
    expect(readInvite(LINK_BASE + 'A'.repeat(5_000))).toBeNull();
    expect(readInvite('https://example.com/g/#abc')).toBeNull();
  });

  it('strip control and text-direction characters from names', () => {
    const got = readInvite(linkWith({ ...valid(), n: 'Fam\u0000ily\u202e', f: '  Bo\u0007b  ' }));
    expect(got).toEqual({ code: CODE, groupName: 'Family', inviter: 'Bob' });
  });

  it('encode UTF-8 base64url both ways', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'Ωμέγα', '🎧 music', '{"x":1}'])
      expect(fromBase64Url(toBase64Url(s))).toBe(s);
    expect(toBase64Url('ÿþ')).not.toMatch(/[+/=]/);
  });
});
