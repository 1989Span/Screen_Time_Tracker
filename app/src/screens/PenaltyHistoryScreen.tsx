import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { BackChip, Card } from '../components/ui';
import { usePenaltyHistoryModel } from '../models/penalty';

export function PenaltyHistoryScreen() {
  const h = usePenaltyHistoryModel();

  return (
    <View style={styles.wrap}>
      <BackChip label="Overview" onPress={h.goOverview} />
      <Text style={styles.title}>Charge history</Text>

      <Card style={styles.summaryCard}>
        <Text style={styles.label}>{h.monthNote}</Text>
        <Text style={styles.balance}>{h.monthTotal}</Text>
        <Text style={styles.label}>
          All time {h.allTime} · {h.allTimeNote} · paper money
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{h.daysOver}</Text>
            <Text style={styles.label}>days over limit</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{h.minutesOver}</Text>
            <Text style={styles.label}>time over, total</Text>
          </View>
        </View>
      </Card>

      {h.months.map((m) => (
        <Card key={m.title} style={styles.listCard}>
          <View style={[styles.row, styles.monthHead]}>
            <Text style={[styles.day, { flex: 1 }]}>{m.title}</Text>
            <Text style={styles.amount}>{m.total}</Text>
          </View>
          {m.rows.map((r, i: number) => (
            <View key={i} style={[styles.row, i === m.rows.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.day}>{r.label}</Text>
                <Text style={styles.detail}>{r.detail}</Text>
              </View>
              <Text style={[styles.amount, !r.over && { color: alpha(color.text, 40) }]}>{r.amount}</Text>
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 24, letterSpacing: -0.2, color: color.text },
  summaryCard: { padding: 18, gap: 4 },
  label: { fontSize: 11.5, color: alpha(color.text, 48) },
  balance: {
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: color.text,
  },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: {
    flex: 1,
    gap: 1,
    backgroundColor: alpha(color.text, 4),
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statValue: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 18, color: color.text },
  listCard: { paddingHorizontal: 16, paddingVertical: 4 },
  monthHead: { borderBottomColor: alpha(color.text, 12) },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  day: { fontSize: 14, fontFamily: font.bodySemiBold, color: color.text },
  detail: { fontSize: 11.5, color: alpha(color.text, 45) },
  amount: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 15, color: color.text },
});
