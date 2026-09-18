import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { BackChip, Card, CompositionBar, Dot } from '../components/ui';
import { FactBox } from '../components/FactBox';
import { ClockIcon } from '../components/Icons';
import { useDetailModel } from '../models/overview';

export function DetailScreen() {
  const d = useDetailModel();

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <BackChip label="Overview" onPress={d.goOverview} />
        <Text style={styles.scopeText}>{d.scope}</Text>
      </View>

      <View style={styles.segWrap}>
        {d.ranges.map((r) => (
          <Pressable key={r.id} onPress={r.onPress} style={[styles.segBtn, r.active && styles.segBtnActive]}>
            <Text style={[styles.segText, r.active && styles.segTextActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.summaryCard}>
        <FactBox text={d.fact} />
        <View style={styles.totalRow}>
          <View style={{ gap: 7 }}>
            <Text style={styles.totalText}>{d.total}</Text>
            <View
              style={[
                styles.deltaChip,
                {
                  backgroundColor: d.deltaNeutral
                    ? alpha(color.text, 7)
                    : d.deltaPositive
                      ? 'rgba(181,87,107,0.14)'
                      : 'rgba(79,140,123,0.15)',
                },
              ]}
            >
              <Text
                style={[
                  styles.deltaText,
                  { color: d.deltaNeutral ? alpha(color.text, 55) : d.deltaPositive ? color.roseDark : color.tealDark },
                ]}
              >
                {d.delta}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={styles.avgText}>{d.avg}</Text>
            <Text style={styles.avgLabel}>{d.avgLabel}</Text>
          </View>
        </View>
        <CompositionBar segments={d.comp} height={10} />
      </Card>

      <Card style={styles.chartCard}>
        <View style={[styles.chart, { gap: d.gap }]}>
          {d.stacks.map((s, i: number) => (
            <Pressable key={i} onPress={s.onPress} style={[styles.bar, { opacity: s.dim ? 0.26 : 1 }]}>
              <View style={styles.barSegs}>
                {s.segs.map((g, k: number) => (
                  <View
                    key={k}
                    style={{
                      height: g.h,
                      backgroundColor: g.color,
                      borderTopLeftRadius: g.topRadius ? 6 : 0,
                      borderTopRightRadius: g.topRadius ? 6 : 0,
                    }}
                  />
                ))}
              </View>
              <Text style={[styles.tick, { color: s.active ? color.text : alpha(color.text, 42) }]} numberOfLines={1}>
                {s.tick}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chartFooter}>
          <Text style={styles.chartFooterText}>{d.axisNote}</Text>
          <Text style={styles.chartFooterText}>Tap a bar to zoom in</Text>
        </View>
      </Card>

      <View style={styles.bkHeadRow}>
        <Text style={styles.bkTitle}>Breakdown</Text>
        <Text style={styles.bkCount}>{d.count}</Text>
      </View>
      <Card style={styles.bkCard}>
        {d.rows.map((row, i: number) => (
          <Pressable
            key={i}
            onPress={row.onPress}
            style={[styles.bkRow, i === d.rows.length - 1 && { borderBottomWidth: 0 }]}
          >
            <View style={styles.bkTopRow}>
              <Dot size={10} color={row.tone} />
              <Text style={styles.bkName}>{row.name}</Text>
              <Text style={styles.bkShare}>{row.share}</Text>
              <Text style={styles.bkTime}>{row.time}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${row.pct}%`, backgroundColor: row.tone }]} />
            </View>
            <View style={[styles.limChip, { backgroundColor: row.limBg }]}>
              <ClockIcon size={12} color={row.limFg} strokeWidth={1.6} />
              <Text style={[styles.limChipText, { color: row.limFg }]}>{row.limChip}</Text>
            </View>
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  scopeText: { fontSize: 12.5, color: alpha(color.text, 52) },
  segWrap: { flexDirection: 'row', gap: 4, backgroundColor: alpha(color.text, 7), borderRadius: 999, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center' },
  segBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#1d1f20',
    shadowOpacity: 0.16,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segText: { fontFamily: font.bodySemiBold, fontSize: 13, color: alpha(color.text, 55) },
  segTextActive: { color: color.text },
  summaryCard: { padding: 18, paddingTop: 18, paddingBottom: 16, gap: 14 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  totalText: {
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 42,
    lineHeight: 40,
    letterSpacing: -0.8,
    color: color.text,
  },
  deltaChip: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999 },
  deltaText: { fontSize: 12, fontFamily: font.bodySemiBold },
  avgText: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 19, color: color.text },
  avgLabel: { fontSize: 11, color: alpha(color.text, 48) },
  chartCard: { padding: 16, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12, gap: 12 },
  chart: { height: 180, flexDirection: 'row', alignItems: 'flex-end' },
  bar: { flex: 1, minWidth: 0, flexDirection: 'column' },
  barSegs: { flex: 1, flexDirection: 'column', justifyContent: 'flex-end', gap: 1 },
  tick: { height: 16, paddingTop: 5, textAlign: 'center', fontSize: 9.5, fontFamily: font.bodySemiBold },
  chartFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: alpha(color.text, 8),
    paddingTop: 10,
  },
  chartFooterText: { fontSize: 11.5, color: alpha(color.text, 48) },
  bkHeadRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 },
  bkTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 17, color: color.text },
  bkCount: { fontSize: 12, color: alpha(color.text, 48) },
  bkCard: { paddingHorizontal: 16, paddingVertical: 6 },
  bkRow: { width: '100%', gap: 8, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: alpha(color.text, 7) },
  bkTopRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9 },
  bkName: { flex: 1, fontSize: 14.5, fontFamily: font.bodySemiBold, color: color.text },
  bkShare: { fontSize: 12, color: alpha(color.text, 46) },
  bkTime: {
    width: 82,
    textAlign: 'right',
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 15,
    color: color.text,
  },
  track: { width: '100%', height: 6, borderRadius: 999, backgroundColor: alpha(color.text, 7) },
  fill: { height: '100%', borderRadius: 999 },
  limChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  limChipText: { fontSize: 11, fontFamily: font.bodySemiBold },
});
