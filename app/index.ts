import { registerRootComponent } from 'expo';

import App from './App';
import { installDefaultUsageSource } from './src/usage/bootstrap';

// Install the usage source before anything renders: the data layer throws if it
// is asked for numbers with no source installed.
installDefaultUsageSource();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
