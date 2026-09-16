import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { BackChip, Card, Dot } from '../components/ui';

export function LimitEditorScreen({ model }: { model: any }) {
  const e = model.limitEditor;
  return (
    <View style={styles.wrap}>
      <BackChip label="App timers" onPress={model.backToLimits} />

      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Dot size={12} color={e.color} />
          <Text style={styles.name}>{e.name}</Text>
          <View style={[styles.stateChip, { backgroundColor: e.stateBg }]}>
            <Text style={[styles.stateText, { color: e.stateFg }]}>{e.stateText}</Text>
          </View>
        </View>
        <View style={styles.usedRow}>
          <View style={{ gap: 2 }}>
            <Text style={styles.usedText}>{e.used}</Text>
            <Text style={styles.usedLabel}>used today</Text>
          </View>
          <Text style={styles.limitText}>{e.limitText}</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${e.pct}%`, backgroundColor: e.barColor }]} />
        </View>
      </Card>

      <View style={{ gap: 10 }}>
        <Text style={styles.sectionTitle}>Daily limit</Text>
        <View style={styles.grid}>
          {[0, 1].map((row) => (
            <View key={row} style={styles.gridRow}>
              {e.presets.slice(row * 4, row * 4 + 4).map((p: any) => (
                <Pressable
                  key={p.v}
                  onPress={p.onPress}
                  style={[styles.preset, { backgroundColor: p.active ? e.color : '#ffffff' }]}
                >
                  <Text style={[styles.presetText, { color: p.active ? '#ffffff' : color.text }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
        <Text style={styles.hint}>{e.hint}</Text>
        {e.hasLimit && (
          <Pressable onPress={e.clear} style={styles.removeBtn}>
            <Text style={styles.removeText}>Remove timer</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  card: { padding: 18, gap: 13 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  name: { flex: 1, fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, letterSpacing: -0.2, color: color.text },
  stateChip: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  stateText: { fontSize: 11.5, fontFamily: font.bodySemiBold },
  usedRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  usedText: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 34, lineHeight: 33, letterSpacing: -0.5, color: color.text },
  usedLabel: { fontSize: 11.5, color: alpha(color.text, 48) },
  limitText: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: alpha(color.text, 60) },
  track: { height: 8, borderRadius: 999, backgroundColor: alpha(color.text, 7) },
  fill: { height: '100%', borderRadius: 999 },
  sectionTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 16, paddingLeft: 4, color: color.text },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  preset: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#1d1f20',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  presetText: { fontFamily: font.bodySemiBold, fontSize: 13.5 },
  hint: { paddingHorizontal: 4, fontSize: 12.5, lineHeight: 18, color: alpha(color.text, 52) },
  removeBtn: {
    marginTop: 2,
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: alpha(color.text, 14),
    alignItems: 'center',
  },
  removeText: { fontFamily: font.bodySemiBold, fontSize: 13.5, color: color.roseDark },
});
