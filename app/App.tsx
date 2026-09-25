import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { modernBg } from './src/theme';
import { useNavStore } from './src/state/navStore';
import { useStoresHydrated } from './src/state/hydration';
import { OverviewScreen } from './src/screens/OverviewScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { LimitsScreen } from './src/screens/LimitsScreen';
import { LimitEditorScreen } from './src/screens/LimitEditorScreen';
import { PenaltyScreen } from './src/screens/PenaltyScreen';
import { PenaltyHistoryScreen } from './src/screens/PenaltyHistoryScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { GroupRulesScreen } from './src/screens/GroupRulesScreen';
import { GroupSettingsScreen } from './src/screens/GroupSettingsScreen';
import { GroupInviteScreen } from './src/screens/GroupInviteScreen';
import { NewGroupScreen } from './src/screens/NewGroupScreen';
import { TabBar } from './src/components/TabBar';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppPickerScreen } from './src/screens/AppPickerScreen';
import { PermissionScreen } from './src/screens/PermissionScreen';
import { useSetupGate } from './src/state/useSetupGate';
import { useWidgetLinks } from './src/state/widgetLinks';
import { DISABLED_VIEWS } from './src/features';

export default function App() {
  return (
    <ErrorBoundary>
      <Tracker />
    </ErrorBoundary>
  );
}

const SCREENS = {
  ov: OverviewScreen,
  detail: DetailScreen,
  penalty: PenaltyScreen,
  history: PenaltyHistoryScreen,
  groups: GroupsScreen,
  groupSettings: GroupSettingsScreen,
  groupRules: GroupRulesScreen,
  groupInvite: GroupInviteScreen,
  newGroup: NewGroupScreen,
  limits: LimitsScreen,
  limit: LimitEditorScreen,
  apps: AppPickerScreen,
} as const;

function Tracker() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  const view = useNavStore((s) => s.view);
  const hydrated = useStoresHydrated();
  const gate = useSetupGate();
  // A tap on the home-screen widget opens that range's breakdown.
  useWidgetLinks(hydrated);

  // Hold the first paint until fonts and saved state are both ready, so the app
  // never flashes default settings over the user's own.
  if (!fontsLoaded || !hydrated) return <View style={styles.root} />;

  // Setup is a gate, not a destination: until the OS lets us read usage and the
  // user has chosen something to measure, there is no real data to show, and
  // showing generated numbers instead would misrepresent their own screen time.
  // A view behind a disabled feature flag falls back to Overview rather than
  // rendering an orphan screen with no way back.
  const routed = DISABLED_VIEWS.includes(view) ? 'ov' : view;
  const Screen = gate === 'permission' ? PermissionScreen : gate === 'apps' ? AppPickerScreen : SCREENS[routed];
  const routeKey = gate ?? routed;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        {/* Keyed by route so each screen opens scrolled to the top. */}
        <ScrollView key={routeKey} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Screen />
        </ScrollView>
      </SafeAreaView>
      {gate === null && (
        <SafeAreaView style={styles.tabArea} edges={['bottom', 'left', 'right']}>
          <TabBar />
        </SafeAreaView>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: modernBg },
  tabArea: { backgroundColor: '#ffffff' },
  content: { padding: 16, paddingTop: 14, paddingBottom: 44, gap: 14 },
});
