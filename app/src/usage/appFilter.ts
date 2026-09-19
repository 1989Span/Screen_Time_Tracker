// Which installed packages are worth showing in the picker, and in what order.
//
// A device reports far more packages than a person would call "apps". The first
// device measured had 591 installed, of which 109 had a launcher icon and 97
// were user-installed. Worse, the raw usage numbers are dominated by things that
// are not apps at all: over one 7-day window the screensaver
// (com.android.dreams.basic) was the second heaviest at 431 minutes and the
// Samsung launcher was tenth at 77. Tracking those would make every total wrong.

import { InstalledApp } from '../../modules/usage-stats';
import { Series, colorForId } from './series';

/** This app. Counting our own foreground time would be circular. */
export const SELF_PACKAGE = 'com.span1989.gauge';

/**
 * Packages that are never offered, whatever their system flag says.
 *
 * Deliberately narrow: it covers things that accrue large amounts of foreground
 * time while not being an app a person chose to use. The system-flag filter
 * already hides most of these; this list exists because the flag is not a
 * reliable guide on every OEM, and the screensaver in particular is both
 * enormous and obviously not screen "usage" in the sense the app reports.
 */
export const NEVER_OFFER = new Set<string>([
  SELF_PACKAGE,
  'com.android.dreams.basic', // screensaver — ranked #2 by time on the test device
  'com.android.systemui',
  'com.android.settings',
  'android',
]);

/** Launcher packages accrue time on every home-screen visit. Suffix-matched
 *  because the package differs per OEM (sec.android.app.launcher, nexuslauncher…). */
const LAUNCHER_HINTS = ['launcher', 'home'];

const looksLikeLauncher = (pkg: string) => LAUNCHER_HINTS.some((h) => pkg.toLowerCase().includes(h));

export interface AppFilterOptions {
  /** Include packages flagged FLAG_SYSTEM. Off by default, user-overridable. */
  showSystem: boolean;
}

/**
 * The apps to offer, sorted for a picker: alphabetical by label, case-insensitive.
 *
 * Always excluded regardless of options: anything with no launcher icon (a
 * service the user would not recognise), the NEVER_OFFER list, and launchers.
 */
export function offerableApps(apps: InstalledApp[], { showSystem }: AppFilterOptions): InstalledApp[] {
  return apps
    .filter((a) => a.hasLauncherIcon)
    .filter((a) => !NEVER_OFFER.has(a.packageName))
    .filter((a) => !looksLikeLauncher(a.packageName))
    .filter((a) => showSystem || !a.isSystem)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

/**
 * Whether a package may be counted, independent of the picker.
 *
 * The picker and the data path have to agree, or a package hidden from the UI
 * could still contribute minutes to totals. Both go through this.
 */
export function isCountable(pkg: string): boolean {
  return !NEVER_OFFER.has(pkg) && !looksLikeLauncher(pkg);
}

/** Turn tracked packages into chart series, in the given order. */
export function seriesForApps(tracked: string[], byPackage: Map<string, InstalledApp>): Series[] {
  return tracked.map((pkg) => {
    const app = byPackage.get(pkg);
    return {
      id: pkg,
      // An app can be uninstalled while still having history, so fall back to
      // the package name rather than rendering a blank row.
      name: app?.label ?? pkg,
      color: colorForId(pkg),
      androidCategory: app?.category ?? -1,
    };
  });
}
