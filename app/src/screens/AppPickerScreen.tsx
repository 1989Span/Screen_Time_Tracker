import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { NudgeCard } from '../components/NudgeCard';
import { Card, Dot } from '../components/ui';
import { useAppPickerModel } from '../models/setup';
import { alpha, color, font } from '../theme';

/**
 * Choose which apps count.
 *
 * Nothing is tracked by default, so this is the first thing a new user does. The
 * test device offered 87 apps after filtering out system packages, launchers and
 * the screensaver, which is why there is a search box rather than a plain list.
 *
 * Each row carries the same generated colour the charts will use, so the picker
 * doubles as a preview of the breakdown.
 */
export function AppPickerScreen() {
  const m = useAppPickerModel();

  return (
    <View style={styles.wrap}>
      {/* This screen is also the first-run app picker. Nudges only make sense
          once something is tracked, so the switch waits until then. */}
      {m.canContinue && <NudgeCard />}

      <View style={{ gap: 4 }}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Choose apps</Text>
          <Pressable onPress={m.toggleShowSystem} hitSlop={8}>
            <Text style={styles.toggleAll}>{m.showSystem ? 'Hide system' : 'Show system'}</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Only the apps you pick are measured. You can change this any time.</Text>
        <View style={styles.metaRow}>
          <Text style={styles.count}>{m.countLabel}</Text>
          <Pressable onPress={m.bulkAction} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.bulk}>{m.bulkLabel}</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        value={m.query}
        onChangeText={m.setQuery}
        placeholder="Search apps"
        placeholderTextColor={alpha(color.text, 35)}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Search apps"
        style={styles.input}
      />

      {m.emptyNote !== null ? (
        <Card style={styles.emptyCard}>
          <Text style={styles.emptyText}>{m.emptyNote}</Text>
        </Card>
      ) : (
        <Card style={styles.card}>
          {m.rows.map((row, i) => (
            <Pressable
              key={row.packageName}
              onPress={row.onPress}
              accessibilityRole="switch"
              accessibilityState={{ checked: row.tracked }}
              accessibilityLabel={row.label}
              style={[styles.row, i === m.rows.length - 1 && { borderBottomWidth: 0 }]}
            >
              <Dot size={11} color={row.tracked ? row.color : alpha(color.text, 18)} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text
                  numberOfLines={1}
                  style={[styles.name, { color: row.tracked ? color.text : alpha(color.text, 42) }]}
                >
                  {row.label}
                </Text>
                <Text numberOfLines={1} style={styles.pkg}>
                  {row.isSystem ? 'System · ' : ''}
                  {row.packageName}
                </Text>
              </View>
              <View style={[styles.switchTrack, { backgroundColor: row.tracked ? row.color : alpha(color.text, 16) }]}>
                <View style={[styles.switchKnob, { left: row.tracked ? 16 : 2 }]} />
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      {!m.canContinue && (
        <Text style={styles.hint}>Pick at least one app — otherwise there is nothing to measure.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 24, letterSpacing: -0.2, color: color.text },
  toggleAll: {
    fontSize: 13,
    fontFamily: font.bodySemiBold,
    color: color.accent700,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  subtitle: { fontSize: 13, lineHeight: 19, color: alpha(color.text, 55) },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  count: { fontSize: 11.5, fontFamily: font.bodySemiBold, color: alpha(color.text, 45) },
  bulk: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: color.accent700, paddingVertical: 4 },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 14,
    color: color.text,
  },
  card: { paddingHorizontal: 16, paddingVertical: 4 },
  emptyCard: { padding: 18 },
  emptyText: { fontSize: 13.5, lineHeight: 20, color: alpha(color.text, 55) },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  name: { fontSize: 15, fontFamily: font.bodySemiBold },
  pkg: { fontSize: 11, color: alpha(color.text, 40) },
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
  hint: { fontSize: 12.5, color: color.roseDark },
});
