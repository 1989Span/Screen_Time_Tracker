import { InstalledApp } from '../../modules/usage-stats';
import { NEVER_OFFER, SELF_PACKAGE, isCountable, offerableApps, seriesForApps } from '../usage/appFilter';

const app = (over: Partial<InstalledApp> & { packageName: string }): InstalledApp => ({
  label: over.packageName,
  category: -1,
  isSystem: false,
  hasLauncherIcon: true,
  ...over,
});

describe('offerableApps', () => {
  it('hides system apps by default and shows them on request', () => {
    const apps = [
      app({ packageName: 'com.a', label: 'Alpha' }),
      app({ packageName: 'com.b', label: 'Beta', isSystem: true }),
    ];
    expect(offerableApps(apps, { showSystem: false }).map((a) => a.packageName)).toEqual(['com.a']);
    expect(offerableApps(apps, { showSystem: true }).map((a) => a.packageName)).toEqual(['com.a', 'com.b']);
  });

  it('always hides packages with no launcher icon', () => {
    const apps = [
      app({ packageName: 'com.a', label: 'Alpha' }),
      app({ packageName: 'com.svc', label: 'Svc', hasLauncherIcon: false }),
    ];
    for (const showSystem of [false, true]) {
      expect(offerableApps(apps, { showSystem }).map((a) => a.packageName)).toEqual(['com.a']);
    }
  });

  it('never offers the screensaver, which ranked second by time on a real device', () => {
    const apps = [
      app({ packageName: 'com.android.dreams.basic', label: 'Screensaver' }),
      app({ packageName: 'com.a', label: 'Alpha' }),
    ];
    // Even with system apps shown, this must not appear.
    expect(offerableApps(apps, { showSystem: true }).map((a) => a.packageName)).toEqual(['com.a']);
  });

  it('never offers this app itself', () => {
    const apps = [app({ packageName: SELF_PACKAGE, label: 'Gauge' }), app({ packageName: 'com.a', label: 'Alpha' })];
    expect(offerableApps(apps, { showSystem: true }).map((a) => a.packageName)).toEqual(['com.a']);
  });

  it('filters launchers whatever the OEM calls them', () => {
    const apps = [
      app({ packageName: 'com.sec.android.app.launcher', label: 'One UI Home' }),
      app({ packageName: 'com.google.android.apps.nexuslauncher', label: 'Pixel Launcher' }),
      app({ packageName: 'com.a', label: 'Alpha' }),
    ];
    expect(offerableApps(apps, { showSystem: true }).map((a) => a.packageName)).toEqual(['com.a']);
  });

  it('sorts by label, case-insensitively, not by package', () => {
    const apps = [
      app({ packageName: 'com.z', label: 'apple' }),
      app({ packageName: 'com.a', label: 'Banana' }),
      app({ packageName: 'com.m', label: 'Cherry' }),
    ];
    expect(offerableApps(apps, { showSystem: false }).map((a) => a.label)).toEqual(['apple', 'Banana', 'Cherry']);
  });

  it('returns nothing for an empty device', () => {
    expect(offerableApps([], { showSystem: true })).toEqual([]);
  });
});

describe('isCountable', () => {
  it('agrees with the picker, so a hidden app cannot still add minutes', () => {
    for (const pkg of NEVER_OFFER) expect(isCountable(pkg)).toBe(false);
    expect(isCountable('com.sec.android.app.launcher')).toBe(false);
    expect(isCountable('com.instagram.android')).toBe(true);
  });
});

describe('seriesForApps', () => {
  const installed = new Map<string, InstalledApp>([
    ['com.instagram.android', app({ packageName: 'com.instagram.android', label: 'Instagram', category: 4 })],
  ]);

  it('preserves the tracked order', () => {
    const s = seriesForApps(['com.b', 'com.a'], new Map());
    expect(s.map((x) => x.id)).toEqual(['com.b', 'com.a']);
  });

  it('uses the app label and carries the android category', () => {
    const [s] = seriesForApps(['com.instagram.android'], installed);
    expect(s.name).toBe('Instagram');
    expect(s.androidCategory).toBe(4);
  });

  it('falls back to the package name for an app that is no longer installed', () => {
    // History outlives installation, so this must render something, not blank.
    const [s] = seriesForApps(['com.gone.app'], installed);
    expect(s.name).toBe('com.gone.app');
    expect(s.androidCategory).toBe(-1);
  });

  it('gives each package a stable, distinct colour', () => {
    const a = seriesForApps(['com.a'], new Map())[0].color;
    const again = seriesForApps(['com.a'], new Map())[0].color;
    const b = seriesForApps(['com.b'], new Map())[0].color;
    expect(a).toBe(again); // stable between calls, so charts do not reshuffle
    expect(a).not.toBe(b);
    expect(a).toMatch(/^hsl\(/);
  });
});
