import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Card, Dot } from '../components/ui';

export function LimitsScreen({ model }: { model: any }) {
  const rows = model.limits.list;
  return (
    <View style={styles.wrap}>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>App timers</Text>
        <Text style={styles.subtitle}>Give a category a daily budget. Apps pause when it runs out and start fresh at midnight.</Text>
      </View>
      <Card style={styles.card}>
        {rows.map((l: any, i: number) => (
          <Pressable key={l.id} onPress={l.onPress} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={styles.topRow}>
              <Dot size={11} color={l.color} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.name}>{l.name}</Text>
                <Text style={styles.used}>{l.used}</Text>
              </View>
              <View style={[styles.stateChip, { backgroundColor: l.bg }]}>
                <Text style={[styles.stateText, { color: l.fg }]}>{l.text}</Text>
              </View>
              <Text style={styles.limStr}>{l.limStr}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${l.pct}%`, backgroundColor: l.barColor }]} />
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 24, letterSpacing: -0.2, color: color.text },
  subtitle: { fontSize: 13, lineHeight: 19, color: alpha(color.text, 55) },
  card: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { width: '100%', gap: 8, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: alpha(color.text, 7) },
  topRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontFamily: font.bodySemiBold, color: color.text },
  used: { fontSize: 11.5, color: alpha(color.text, 45) },
  stateChip: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  stateText: { fontSize: 11.5, fontFamily: font.bodySemiBold },
  limStr: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 15, minWidth: 44, textAlign: 'right', color: color.text },
  track: { width: '100%', height: 5, borderRadius: 999, backgroundColor: alpha(color.text, 7) },
  fill: { height: '100%', borderRadius: 999 },
});
