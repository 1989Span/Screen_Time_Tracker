import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackChip, Card } from '../components/ui';
import { useChallengeModel } from '../models/challenge';
import { alpha, color, font } from '../theme';
import { g } from './groupStyles';

export function ChallengeScreen() {
  const c = useChallengeModel();
  if (c === null) return null;
  const days = c.board?.days ?? [];

  return (
    <View style={g.wrap}>
      <View style={g.topRow}>
        <BackChip label={c.groupName} onPress={c.back} />
        <Text style={g.screenTitle}>Time challenge</Text>
      </View>

      {c.error !== null && <Text style={g.error}>{c.error}</Text>}

      {c.proposal && (
        <Card style={g.card}>
          <Text style={g.cardTitle}>{c.proposal.title}</Text>
          {c.proposal.lines.map((line, i) => (
            <Text key={i} style={i === 0 ? g.body : g.meta}>
              {line}
            </Text>
          ))}
          {c.proposal.answer && (
            <View style={styles.actions}>
              <Pressable
                onPress={c.proposal.answer.decline}
                disabled={c.busy}
                accessibilityRole="button"
                style={[g.secondary, styles.flex, c.busy && g.disabled]}
              >
                <Text style={g.secondaryText}>Decline</Text>
              </Pressable>
              <Pressable
                onPress={c.proposal.answer.accept}
                disabled={c.busy}
                accessibilityRole="button"
                style={[g.primary, styles.flex, c.busy && g.disabled]}
              >
                <Text style={g.primaryText}>Accept</Text>
              </Pressable>
            </View>
          )}
          {c.proposal.withdraw && (
            <Pressable onPress={c.proposal.withdraw} disabled={c.busy} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.quietLink}>Withdraw proposal</Text>
            </Pressable>
          )}
        </Card>
      )}

      {c.board && (
        <Card style={g.card}>
          <Text style={g.label}>{c.board.title}</Text>
          <Text style={styles.pool}>{c.board.headline}</Text>
          <Text style={g.meta}>{c.board.sub}</Text>
          {c.board.notPlaying !== '' && <Text style={g.meta}>{c.board.notPlaying}</Text>}
          <View style={styles.tableHead}>
            <Text style={[g.meta, styles.flex]}>Player</Text>
            <Text style={[g.meta, styles.num]}>Points</Text>
            <Text style={[g.meta, styles.money]}>Paid in</Text>
          </View>
          {c.board.rows.map((r) => (
            <View key={r.id} style={styles.tableRow}>
              <Text style={[g.name, r.leading && { color: color.tealDark }]}>{r.name}</Text>
              <Text style={[styles.cell, styles.num]}>{r.points}</Text>
              <Text style={[styles.cell, styles.money]}>{r.paid}</Text>
            </View>
          ))}
        </Card>
      )}

      {c.propose && (
        <Card style={g.card}>
          <Text style={g.cardTitle}>Propose a challenge</Text>
          <Text style={g.meta}>{c.propose.note}</Text>
          <Text style={g.label}>Daily fee for everyone but the day’s lowest</Text>
          <View style={styles.presetRow}>
            {c.propose.presets.map((p) => (
              <Pressable
                key={p.v}
                onPress={p.onPress}
                style={[styles.preset, p.active && { backgroundColor: color.accent, borderColor: color.accent }]}
              >
                <Text style={[styles.presetText, p.active && { color: '#ffffff' }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.field, c.propose.feeError !== '' && { borderColor: color.rose }]}>
            <Text style={styles.affix}>$</Text>
            <TextInput
              value={c.propose.feeText}
              onChangeText={c.propose.setFeeText}
              placeholder="Custom amount"
              placeholderTextColor={alpha(color.text, 35)}
              keyboardType="decimal-pad"
              style={styles.input}
            />
          </View>
          {c.propose.feeError !== '' && <Text style={g.error}>{c.propose.feeError}</Text>}
          <Text style={g.body}>{c.propose.summary}</Text>
          <Pressable
            onPress={c.propose.submit}
            disabled={!c.propose.possible || c.busy || c.propose.feeError !== ''}
            accessibilityRole="button"
            style={[g.primary, (!c.propose.possible || c.busy || c.propose.feeError !== '') && g.disabled]}
          >
            <Text style={g.primaryText}>Propose to the group</Text>
          </Pressable>
        </Card>
      )}

      {days.length > 0 && (
        <Card style={g.card}>
          <Text style={g.label}>Day by day</Text>
          {days.map((d, i) => (
            <View key={d.label} style={[g.row, i === days.length - 1 && g.lastRow]}>
              <Text style={styles.day}>{d.label}</Text>
              <Text style={[g.meta, styles.flex]}>{d.text}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card style={g.card}>
        <Text style={g.label}>How it works</Text>
        {c.rules.map((r, i) => (
          <Text key={i} style={g.meta}>
            {r}
          </Text>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  quietLink: { fontFamily: font.bodySemiBold, fontSize: 12.5, color: color.roseDark, marginTop: 4 },
  pool: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 30, letterSpacing: -0.4, color: color.text },
  tableHead: { flexDirection: 'row', marginTop: 6 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: alpha(color.text, 7),
  },
  cell: { fontFamily: font.bodySemiBold, fontSize: 14, color: color.text },
  num: { width: 56, textAlign: 'right' },
  money: { width: 80, textAlign: 'right' },
  day: { width: 52, fontFamily: font.bodySemiBold, fontSize: 13, color: color.text },
  presetRow: { flexDirection: 'row', gap: 6 },
  preset: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: alpha(color.text, 12),
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  presetText: { fontFamily: font.bodySemiBold, fontSize: 13, color: color.text },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: alpha(color.text, 12),
    paddingHorizontal: 10,
  },
  affix: { fontFamily: font.bodySemiBold, fontSize: 12.5, color: alpha(color.text, 50) },
  input: { flex: 1, minWidth: 0, paddingVertical: 8, fontFamily: font.bodySemiBold, fontSize: 13.5, color: color.text },
});
