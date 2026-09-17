import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Card } from './ui';
import { ChevronRightIcon, LockIcon } from './Icons';

export function PenaltyCard({ model }: { model: any }) {
  const p = model.penalty;
  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>Penalty limit</Text>
        <View style={[styles.stateChip, { backgroundColor: p.stateBg }]}>
          <Text style={[styles.stateText, { color: p.stateFg }]}>{p.stateText}</Text>
        </View>
      </View>

      <View style={styles.usedRow}>
        <View style={{ gap: 2 }}>
          <Text style={styles.used}>{p.used}</Text>
          <Text style={styles.label}>tracked today</Text>
        </View>
        <Text style={styles.limitText}>{p.limitText}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${p.pct}%`, backgroundColor: p.barColor }]} />
      </View>

      <View style={styles.moneyRow}>
        <View style={styles.moneyCol}>
          <Text style={styles.label}>Today's charge</Text>
          <Text style={styles.money}>{p.chargeToday}</Text>
          <Text style={styles.note}>{p.chargeNote}</Text>
        </View>
        <View style={styles.moneyCol}>
          <View style={styles.lockLabel}>
            <LockIcon size={13} color={alpha(color.text, 55)} />
            <Text style={styles.label}>Locked balance</Text>
          </View>
          <Text style={styles.money}>{p.locked}</Text>
          <Text style={styles.note}>{p.lockedNote}</Text>
        </View>
      </View>

      {p.pendingText !== '' && <Text style={styles.pending}>{p.pendingText}</Text>}

      <View style={styles.footer}>
        <Pressable onPress={p.openHistory} hitSlop={8} style={styles.link}>
          <Text style={styles.linkText}>Charge history</Text>
          <ChevronRightIcon size={14} color={color.accent700} />
        </Pressable>
        <Pressable onPress={p.openSettings} hitSlop={8} style={styles.link}>
          <Text style={styles.linkText}>{p.on ? 'Settings' : 'Set a limit'}</Text>
          <ChevronRightIcon size={14} color={color.accent700} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, paddingBottom: 14, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 19, letterSpacing: -0.2, color: color.text },
  stateChip: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  stateText: { fontSize: 11.5, fontFamily: font.bodySemiBold },
  usedRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  used: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 29, lineHeight: 28, letterSpacing: -0.5, color: color.text },
  label: { fontSize: 11.5, color: alpha(color.text, 48) },
  limitText: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: alpha(color.text, 60) },
  track: { height: 8, borderRadius: 999, backgroundColor: alpha(color.text, 7) },
  fill: { height: '100%', borderRadius: 999 },
  moneyRow: { flexDirection: 'row', gap: 10 },
  moneyCol: { flex: 1, gap: 2, backgroundColor: alpha(color.text, 4), borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  lockLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  money: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, letterSpacing: -0.3, color: color.text },
  note: { fontSize: 11, color: alpha(color.text, 48) },
  pending: { fontSize: 12, fontFamily: font.bodySemiBold, color: color.accent700 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: alpha(color.text, 8),
    paddingTop: 10,
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkText: { fontSize: 12, fontFamily: font.bodySemiBold, color: color.accent700 },
});
