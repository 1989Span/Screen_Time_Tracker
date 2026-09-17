import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { modernBg } from './src/theme';
import { useScreenTimeModel } from './src/useModel';
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

export default function App() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  const model = useScreenTimeModel();

  if (!fontsLoaded) return <View style={styles.root} />;

  let screen: React.ReactNode = null;
  switch (model.view) {
    case 'ov':
      screen = <OverviewScreen model={model} />;
      break;
    case 'detail':
      screen = <DetailScreen model={model} />;
      break;
    case 'limits':
      screen = <LimitsScreen model={model} />;
      break;
    case 'limit':
      screen = <LimitEditorScreen model={model} />;
      break;
    case 'pick':
      screen = <PickScreen model={model} />;
      break;
    case 'penalty':
      screen = <PenaltyScreen model={model} />;
      break;
    case 'history':
      screen = <PenaltyHistoryScreen model={model} />;
      break;
    case 'groups':
      screen = <GroupsScreen model={model} />;
      break;
    case 'groupSettings':
      screen = model.groupSettings ? <GroupSettingsScreen model={model} /> : <GroupsScreen model={model} />;
      break;
    case 'groupRules':
      screen = model.groupRules ? <GroupRulesScreen model={model} /> : <GroupsScreen model={model} />;
      break;
    case 'groupInvite':
      screen = model.groupInvite ? <GroupInviteScreen model={model} /> : <GroupsScreen model={model} />;
      break;
    case 'newGroup':
      screen = <NewGroupScreen model={model} />;
      break;
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        {/* Keyed by view so each screen opens scrolled to the top. */}
        <ScrollView key={model.view} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {screen}
        </ScrollView>
      </SafeAreaView>
      <SafeAreaView style={styles.tabArea} edges={['bottom', 'left', 'right']}>
        <TabBar tabs={model.tabs} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: modernBg },
  tabArea: { backgroundColor: '#ffffff' },
  content: { padding: 16, paddingTop: 14, paddingBottom: 44, gap: 14 },
});
