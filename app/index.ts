import { registerRootComponent } from 'expo';

import App from './App';
import { installDefaultUsageSource, installRealUsageSource } from './src/usage/bootstrap';
import {
  logDeviceProbe,
  logLiveSource,
  logRollupContents,
  verifyAndroidSource,
  verifyRollupStore,
} from './src/usage/probe';

// Install a source before anything renders: the data layer throws if it is asked
// for numbers with no source installed. The demo generator goes in synchronously
// to satisfy that, then the real device source replaces it on Android. The setup
// gate in App.tsx holds back every screen until the real source can actually
// answer, so the demo numbers are never what the user sees on a phone.
installDefaultUsageSource();
void installRealUsageSource().catch((e: unknown) => console.log('[SOURCE] install failed: ' + String(e)));

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
  // Sequential, not parallel: these share one SQLite connection and racing them
  // was itself producing failures that looked like product bugs.
  void (async () => {
    await logDeviceProbe();
    await verifyRollupStore();
    await verifyAndroidSource();
    await logRollupContents();
    // Let the app's own load finish, then report what it produced.
    setTimeout(logLiveSource, 8000);
  })().catch((e: unknown) => console.log('[DIAG] failed: ' + String(e)));
}
