import { UsageStats, InstalledApp } from '../../modules/usage-stats';
import { isConfigured, pickableApps, useAppsStore } from '../state/appsStore';

const app = (over: Partial<InstalledApp> & { packageName: string }): InstalledApp => ({
  label: over.packageName,
  category: -1,
  isSystem: false,
  hasLauncherIcon: true,
  ...over,
});

beforeEach(() => {
  useAppsStore.setState({
    installed: [],
    tracked: [],
    showSystem: false,
    permission: 'unknown',
    historyDays: 0,
    loading: false,
    error: null,
  });
});

describe('the native module is mocked, not real', () => {
  it('reports no permission rather than throwing', () => {
    // Proves the jest mock is applied: the real module has no native backing
    // under jest and would throw on require.
    expect(UsageStats.hasPermission()).toBe(false);
  });
});

describe('appsStore', () => {
  it('records denial without losing the installed list', async () => {
    jest.spyOn(UsageStats, 'installedApps').mockResolvedValue([app({ packageName: 'com.a', label: 'Alpha' })]);
    await useAppsStore.getState().refresh();
    const s = useAppsStore.getState();
    // The picker can be populated before access is granted, so onboarding can
    // show real apps while asking for permission.
    expect(s.permission).toBe('denied');
    expect(s.installed).toHaveLength(1);
    expect(s.loading).toBe(false);
  });

  it('surfaces a refresh failure instead of pretending to be empty', async () => {
    jest.spyOn(UsageStats, 'installedApps').mockRejectedValue(new Error('boom'));
    await useAppsStore.getState().refresh();
    const s = useAppsStore.getState();
    expect(s.error).toMatch(/boom/);
    expect(s.permission).toBe('unknown');
  });

  it('toggles a package on and off', () => {
    const { toggle } = useAppsStore.getState();
    toggle('com.a');
    expect(useAppsStore.getState().tracked).toEqual(['com.a']);
    toggle('com.a');
    expect(useAppsStore.getState().tracked).toEqual([]);
  });

  it('refuses to track a package the picker would never offer', () => {
    useAppsStore.getState().setTracked(['com.a', 'com.android.dreams.basic', 'com.span1989.gauge']);
    expect(useAppsStore.getState().tracked).toEqual(['com.a']);
  });

  it('filters the picker by the show-system preference', () => {
    useAppsStore.setState({
      installed: [
        app({ packageName: 'com.a', label: 'Alpha' }),
        app({ packageName: 'com.s', label: 'Sys', isSystem: true }),
      ],
    });
    expect(pickableApps(useAppsStore.getState()).map((a) => a.packageName)).toEqual(['com.a']);
    useAppsStore.getState().setShowSystem(true);
    expect(pickableApps(useAppsStore.getState()).map((a) => a.packageName)).toEqual(['com.a', 'com.s']);
  });
});

describe('isConfigured', () => {
  it('needs both permission and at least one tracked app', () => {
    expect(isConfigured({ permission: 'denied', tracked: ['com.a'] })).toBe(false);
    expect(isConfigured({ permission: 'granted', tracked: [] })).toBe(false);
    expect(isConfigured({ permission: 'granted', tracked: ['com.a'] })).toBe(true);
  });
});
