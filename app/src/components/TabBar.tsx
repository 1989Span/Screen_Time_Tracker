import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { ClockIcon, GroupIcon, HomeIcon, SettingsIcon } from './Icons';

const ICONS: Record<string, (p: { size: number; color: string }) => React.ReactElement> = {
  overview: HomeIcon,
  groups: GroupIcon,
  timers: ClockIcon,
  settings: SettingsIcon,
};

export function TabBar({ tabs }: { tabs: any[] }) {
  return (
    <View style={styles.bar}>
      {tabs.map((t) => {
        const Icon = ICONS[t.id];
        const tint = t.active ? color.accent700 : alpha(color.text, 45);
        return (
          <Pressable key={t.id} onPress={t.onPress} style={styles.tab}>
            <Icon size={21} color={tint} />
            <Text style={[styles.label, { color: tint }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: alpha(color.text, 8),
    paddingTop: 8,
    paddingBottom: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  label: { fontFamily: font.bodySemiBold, fontSize: 11 },
});
