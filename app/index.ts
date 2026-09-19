import { registerRootComponent } from 'expo';

import App from './App';
import { installDefaultUsageSource } from './src/usage/bootstrap';
import { logDeviceProbe, verifyRollupStore } from './src/usage/probe';

// Install the usage source before anything renders: the data layer throws if it
// is asked for numbers with no source installed.
installDefaultUsageSource();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Dev-only device diagnostics: what this device retains, and how useful its app
// categories are. Both can only be measured, not looked up.
//
// Statically imported on purpose. A dynamic import() here resolves through
// Metro's lazy async require, which fetches a separate chunk at runtime; when
// that failed the rejection went unobserved and the probe silently never ran.
// The __DEV__ guard still keeps it from executing in a release build.
if (__DEV__) {
  logDeviceProbe().catch((e: unknown) => console.log('[PROBE] failed to start: ' + String(e)));
  // The SQL is stubbed under jest, so this is where SQLite is really verified.
  verifyRollupStore().catch((e: unknown) => console.log('[ROLLUP] failed to start: ' + String(e)));
}
