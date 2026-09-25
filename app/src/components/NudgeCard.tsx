import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useNudgeSetting } from '../state/nudges';
import { alpha, color, font } from '../theme';
import { Card } from './ui';

/** The Settings switch for hourly screen-time nudges. Renders nothing off Android. */
export function NudgeCard() {
  const s = useNudgeSetting();
  if (s === null) return null;

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={s.toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: s.on }}
        accessibilityLabel="Hourly nudges"
        style={styles.row}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>Hourly nudges</Text>
          <Text style={styles.detail}>A notification each time today&rsquo;s screen time passes another hour.</Text>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: s.on ? color.accent : alpha(color.text, 16) }]}>
          <View style={[styles.switchKnob, { left: s.on ? 16 : 2 }]} />
        </View>
      </Pressable>

      {s.blocked && (
        <Pressable onPress={s.openSystemSettings} accessibilityRole="link" hitSlop={6}>
          <Text style={styles.blocked}>
            Notifications are off for Gauge in Android settings. <Text style={styles.link}>Open settings</Text>
          </Text>
        </Pressable>
      )}
    </Card>
  );
}

// The switch matches the app picker's rows below it.
const styles = StyleSheet.create({
  card: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontFamily: font.bodySemiBold, color: color.text },
  detail: { fontSize: 12.5, lineHeight: 18, color: alpha(color.text, 55) },
  blocked: { fontSize: 12.5, lineHeight: 18, color: color.roseDark },
  link: { fontFamily: font.bodySemiBold, color: color.accent700 },
  switchTrack: { width: 34, height: 20, borderRadius: 999, flexShrink: 0 },
  switchKnob: {
    position: 'absolute',
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    shadowColor: '#1d1f20',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
