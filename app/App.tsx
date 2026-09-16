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
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>{screen}</ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: modernBg },
  content: { padding: 16, paddingTop: 14, paddingBottom: 44, gap: 14 },
});
