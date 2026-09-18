import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Card, CompositionBar, Dot } from '../components/ui';
import { FactBox } from '../components/FactBox';
import { PenaltyCard } from '../components/PenaltyCard';
import { ChevronRightIcon } from '../components/Icons';
import { useOverviewModel } from '../models/overview';

export function OverviewScreen() {
  const model = useOverviewModel();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Wasted Time....</Text>

      <PenaltyCard />

      {model.cards.map((c) => (
        <Pressable key={c.id} onPress={c.onPress}>
          {({ pressed }) => (
            <Card style={[styles.timeCard, pressed && styles.timeCardPressed]}>
              <FactBox text={c.fact} />

              <View style={styles.metaRow}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.cardLabel}>{c.label}</Text>
                  <Text style={styles.cardTotal}>{c.total}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text style={styles.metaText}>{c.dates}</Text>
                  <Text style={styles.metaText}>{c.avg}</Text>
                </View>
              </View>

              <CompositionBar segments={c.comp} height={8} />

              <View style={{ gap: 7 }}>
                {c.top.map((t, i: number) => (
                  <View key={i} style={styles.topRow}>
                    <Dot size={9} color={t.tone} />
                    <Text style={styles.topName}>{t.name}</Text>
                    <Text style={styles.topShare}>{t.share}</Text>
                    <Text style={styles.topTime}>{t.time}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.footer}>
                <Text style={styles.moreText}>{c.more}</Text>
                <View style={styles.fullRow}>
                  <Text style={styles.fullText}>Full breakdown</Text>
                  <ChevronRightIcon size={14} color={color.accent700} strokeWidth={1.7} />
                </View>
              </View>
            </Card>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  title: {
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 27,
    letterSpacing: -0.3,
    lineHeight: 30,
    color: color.text,
  },
  timeCard: { padding: 16, paddingTop: 16, paddingBottom: 14, gap: 12 },
  timeCardPressed: { backgroundColor: '#fbfbfc' },
  metaRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardLabel: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 19, letterSpacing: -0.2, color: color.text },
  cardTotal: {
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 29,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: color.text,
  },
  metaText: { fontSize: 11.5, color: alpha(color.text, 48) },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  topName: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 13.5, color: color.text },
  topShare: { fontSize: 11.5, color: alpha(color.text, 46) },
  topTime: {
    width: 74,
    textAlign: 'right',
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 14,
    color: color.text,
  },
  footer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: alpha(color.text, 8),
    paddingTop: 10,
  },
  moreText: { fontSize: 12, fontFamily: font.bodySemiBold, color: color.accent700 },
  fullRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fullText: { fontSize: 12, fontFamily: font.bodySemiBold, color: color.accent700 },
});
