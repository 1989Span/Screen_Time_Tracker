import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Avatar, BackChip, Card, Dot } from '../components/ui';
import { useGroupRulesModel } from '../models/groups';

export function GroupRulesScreen() {
  const r = useGroupRulesModel();
  if (!r) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <BackChip label="Settings" onPress={r.backToSettings} />
        <Text style={styles.title}>{r.name} tracking</Text>
      </View>
      <Text style={styles.subtitle}>
        A category stops counting toward this group’s ranking only when every member agrees, and bringing one back needs
        everyone too. Changes recalculate all past points and streaks.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Not tracked in this group</Text>
        {r.excluded.length ? (
          <View style={styles.chips}>
            {r.excluded.map((c) => (
              <View key={c.id} style={styles.offChip}>
                <Dot size={8} color={c.color} />
                <Text style={styles.offChipText}>{c.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.meta}>Every category counts.</Text>
        )}
      </Card>

      {r.proposals.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Open votes</Text>
          {r.proposals.map((p, i: number) => (
            <View key={p.id} style={[styles.proposal, i > 0 && styles.proposalDivider]}>
              <View style={styles.propHead}>
                <Dot size={10} color={p.color} />
                <Text style={styles.propTitle}>{p.title}</Text>
                <Text style={styles.meta}>{p.progress}</Text>
              </View>
              <View style={styles.votes}>
                {p.votes.map((v) => (
                  <Avatar key={v.id} initial={v.initial} tone={v.color} size={24} faded={!v.agreed} />
                ))}
                <Text style={[styles.meta, { flex: 1, marginLeft: 4 }]} numberOfLines={2}>
                  {p.waiting}
                </Text>
              </View>
              {p.youAgreed ? (
                <View style={styles.actions}>
                  <Text style={[styles.meta, { flex: 1 }]}>You agreed</Text>
                  <Pressable onPress={p.withdraw} style={[styles.btn, styles.btnGhost]}>
                    <Text style={styles.btnGhostText}>Withdraw</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Pressable onPress={p.decline} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
                    <Text style={styles.btnGhostText}>Decline</Text>
                  </Pressable>
                  <Pressable onPress={p.agree} style={[styles.btn, styles.btnPrimary, { flex: 2 }]}>
                    <Text style={styles.btnPrimaryText}>Agree</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.listCard}>
        {r.categories.map((c, i: number) => (
          <View key={c.id} style={[styles.catRow, i === r.categories.length - 1 && { borderBottomWidth: 0 }]}>
            <Dot size={10} color={c.off ? alpha(color.text, 20) : c.color} />
            <Text style={[styles.catName, c.off && { color: alpha(color.text, 45) }]}>{c.name}</Text>
            {c.onPress ? (
              <Pressable onPress={c.onPress} hitSlop={6}>
                <Text style={styles.catAction}>{c.action}</Text>
              </Pressable>
            ) : (
              <Text style={styles.meta}>{c.action}</Text>
            )}
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flex: 1,
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 22,
    letterSpacing: -0.2,
    color: color.text,
  },
  subtitle: { fontSize: 12.5, lineHeight: 18, color: alpha(color.text, 55) },
  card: { padding: 14, gap: 10 },
  cardTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 17, color: color.text },
  meta: { fontSize: 11.5, color: alpha(color.text, 48) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  offChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: alpha(color.text, 6),
  },
  offChipText: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: color.text },
  proposal: { gap: 9 },
  proposalDivider: { borderTopWidth: 1, borderTopColor: alpha(color.text, 7), paddingTop: 12 },
  propHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  propTitle: { flex: 1, fontSize: 14.5, fontFamily: font.bodySemiBold, color: color.text },
  votes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: color.accent },
  btnPrimaryText: { fontFamily: font.bodySemiBold, fontSize: 13, color: '#ffffff' },
  btnGhost: { borderWidth: 1, borderColor: alpha(color.text, 14) },
  btnGhostText: { fontFamily: font.bodySemiBold, fontSize: 13, color: color.roseDark },
  listCard: { paddingHorizontal: 14, paddingVertical: 2 },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  catName: { flex: 1, fontSize: 14, fontFamily: font.bodySemiBold, color: color.text },
  catAction: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: color.accent700 },
});
