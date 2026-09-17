import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { ClockIcon, GroupIcon, HomeIcon, SettingsIcon } from './Icons';
import { TABS, TAB_OF, Tab, useNavStore } from '../state/navStore';
import { useDetailStore } from '../state/detailStore';

const ICONS: Record<Tab, (p: { size: number; color: string }) => React.ReactElement> = {
  overview: HomeIcon,
  groups: GroupIcon,
  timers: ClockIcon,
  settings: SettingsIcon,
};

export function TabBar() {
  const view = useNavStore((s) => s.view);
  const go = useNavStore((s) => s.go);
  const clearBucket = useDetailStore((s) => s.setRange);
  const range = useDetailStore((s) => s.range);
  const active = TAB_OF[view];

  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const Icon = ICONS[t.id];
        const selected = t.id === active;
        const tint = selected ? color.accent700 : alpha(color.text, 45);
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              if (t.id === 'overview') clearBucket(range); // drop any scoped bar
              go(t.root);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={styles.tab}
          >
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
