import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Card, Dot } from '../components/ui';
import { useCategoriesModel } from '../models/overview';

export function PickScreen() {
  const model = useCategoriesModel();
  return (
    <View style={styles.wrap}>
      <View style={{ gap: 4 }}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Categories</Text>
          <Pressable onPress={model.toggleAll} hitSlop={8}>
            <Text style={styles.toggleAll}>{model.allLabel}</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Anything you switch off is left out of your totals and charts.</Text>
      </View>

      <Card style={styles.card}>
        {model.rows.map((p, i: number) => (
          <Pressable key={p.id} onPress={p.onPress} style={[styles.row, i === model.rows.length - 1 && { borderBottomWidth: 0 }]}>
            <Dot size={11} color={p.on ? p.color : alpha(color.text, 18)} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={[styles.name, { color: p.on ? color.text : alpha(color.text, 42) }]}>{p.name}</Text>
              <Text style={styles.avg}>{p.avg}</Text>
            </View>
            <View style={[styles.switchTrack, { backgroundColor: p.on ? p.color : alpha(color.text, 16) }]}>
              <View style={[styles.switchKnob, { left: p.on ? 16 : 2 }]} />
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 24, letterSpacing: -0.2, color: color.text },
  toggleAll: { fontSize: 13, fontFamily: font.bodySemiBold, color: color.accent700, paddingVertical: 6, paddingHorizontal: 2 },
  subtitle: { fontSize: 13, lineHeight: 19, color: alpha(color.text, 55) },
  card: { paddingHorizontal: 16, paddingVertical: 4 },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  name: { fontSize: 15, fontFamily: font.bodySemiBold },
  avg: { fontSize: 11.5, color: alpha(color.text, 45) },
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
