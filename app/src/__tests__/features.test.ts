import { DISABLED_VIEWS, GROUPS_ENABLED, PENALTY_LIMIT_ENABLED } from '../features';
import { TABS, TAB_OF, View } from '../state/navStore';

const viewsUnderTab = (tab: string) => (Object.keys(TAB_OF) as View[]).filter((v) => TAB_OF[v] === tab);

describe('feature flags hide every screen they own', () => {
  // The failure these guard against: a new screen is added to a hidden feature
  // but not to its flag's view list, so it stays reachable in a release build.

  it('disables every Groups view while Groups is off', () => {
    if (GROUPS_ENABLED) return;
    for (const v of viewsUnderTab('groups')) expect(DISABLED_VIEWS).toContain(v);
  });

  it('disables the penalty and charge-history views while the penalty limit is off', () => {
    if (PENALTY_LIMIT_ENABLED) return;
    expect(DISABLED_VIEWS).toEqual(expect.arrayContaining(['penalty', 'history']));
  });

  it('leaves the core tabs alone and drops only the flagged ones', () => {
    // The tab bar hides a tab whose root view is disabled. A flag that listed a
    // core view by mistake would silently remove Overview, Timers or Settings.
    const visible = TABS.filter((t) => !DISABLED_VIEWS.includes(t.root)).map((t) => t.id);
    expect(visible).toEqual(expect.arrayContaining(['overview', 'timers', 'settings']));
    if (!GROUPS_ENABLED) expect(visible).not.toContain('groups');
  });
});
