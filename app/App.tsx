import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { modernBg } from './src/theme';
import { useNavStore } from './src/state/navStore';
import { OverviewScreen } from './src/screens/OverviewScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { LimitsScreen } from './src/screens/LimitsScreen';
import { LimitEditorScreen } from './src/screens/LimitEditorScreen';
import { PickScreen } from './src/screens/PickScreen';
import { PenaltyScreen } from './src/screens/PenaltyScreen';
import { PenaltyHistoryScreen } from './src/screens/PenaltyHistoryScreen';
import { GroupsScreen } from './src/screens/GroupsScreen';
import { GroupRulesScreen } from './src/screens/GroupRulesScreen';
import { GroupSettingsScreen } from './src/screens/GroupSettingsScreen';
import { GroupInviteScreen } from './src/screens/GroupInviteScreen';
import { NewGroupScreen } from './src/screens/NewGroupScreen';
import { TabBar } from './src/components/TabBar';
import { ErrorBoundary } from './src/components/ErrorBoundary';

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
  pick: PickScreen,
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

  if (!fontsLoaded) return <View style={styles.root} />;

  const Screen = SCREENS[view];

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        {/* Keyed by view so each screen opens scrolled to the top. */}
        <ScrollView key={view} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Screen />
        </ScrollView>
      </SafeAreaView>
      <SafeAreaView style={styles.tabArea} edges={['bottom', 'left', 'right']}>
        <TabBar />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: modernBg },
  tabArea: { backgroundColor: '#ffffff' },
  content: { padding: 16, paddingTop: 14, paddingBottom: 44, gap: 14 },
});
