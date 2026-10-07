import { buildGroups } from '../sync/groupsApi';

const G = 'g1';
const group = { id: G, name: 'Family', created_day: '2026-09-20', invite_code: 'a'.repeat(32) };
const member = (user_id: string, name: string) => ({
  group_id: G,
  user_id,
  name,
  joined_day: '2026-09-20',
  excludes: null,
  declines: null,
});
const day = (user_id: string, d: string, minutes: number, updated_at: string) => ({
  group_id: G,
  user_id,
  day: d,
  minutes,
  updated_at,
});

describe('rows from the server, as groups', () => {
  it("gathers each member's days, timed by their latest upload", () => {
    const [g] = buildGroups(
      [group],
      [member('alex', 'Alex')],
      [day('alex', '2026-09-24', 100, '2026-09-24T22:00:00Z'), day('alex', '2026-09-25', 90, '2026-09-25T18:30:00Z')]
    );
    const alex = g.members[0];
    expect(alex.days).toEqual({ '2026-09-24': 100, '2026-09-25': 90 });
    expect(alex.sharedAt).toBe(Date.parse('2026-09-25T18:30:00Z'));
    expect(alex.excludes).toEqual({});
    expect(alex.declines).toEqual([]);
  });

  it("says a member who hasn't uploaded yet never synced", () => {
    const [g] = buildGroups([group], [member('new', 'New')], []);
    expect(g.members[0].sharedAt).toBe(0);
    expect(g.members[0].days).toEqual({});
  });

  it('cleans names another phone supplied', () => {
    const rlo = String.fromCharCode(8238);
    const [g] = buildGroups([{ ...group, name: ' Fam' + rlo + 'ily ' }], [member('x', rlo)], []);
    expect(g.name).toBe('Family');
    expect(g.members[0].name).toBe('?');
  });

  it('keeps members and days to their own group', () => {
    const other = { ...group, id: 'g2' };
    const groups = buildGroups(
      [group, other],
      [member('alex', 'Alex'), { ...member('alex', 'Alex'), group_id: 'g2' }],
      [day('alex', '2026-09-25', 90, '2026-09-25T18:30:00Z')]
    );
    expect(groups[0].members[0].days).toEqual({ '2026-09-25': 90 });
    expect(groups[1].members[0].days).toEqual({});
  });

  it('records who asked to stop tracking each app, per group', () => {
    const other = { ...group, id: 'g2' };
    const groups = buildGroups(
      [group, other],
      [member('alex', 'Alex'), { ...member('sam', 'Sam'), group_id: 'g2' }],
      [],
      [
        { group_id: G, app: 'com.spotify', requested_by: 'alex' },
        { group_id: 'g2', app: 'com.maps', requested_by: 'sam' },
      ]
    );
    expect(groups[0].requestedBy).toEqual({ 'com.spotify': 'alex' });
    expect(groups[1].requestedBy).toEqual({ 'com.maps': 'sam' });
  });

  it('has no requests from a server without them', () => {
    expect(buildGroups([group], [member('alex', 'Alex')], [])[0].requestedBy).toEqual({});
  });
});
