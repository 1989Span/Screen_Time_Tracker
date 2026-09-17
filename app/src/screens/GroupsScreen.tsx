import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Avatar, Card, Dot } from '../components/ui';
import { ChevronRightIcon, SettingsIcon } from '../components/Icons';
import { GroupsViewModel, useGroupsModel } from '../models/groups';

// Ranking row geometry: the bar and top-categories line indent past the rank
// number and avatar, so derive the indent instead of hard-coding it.
const RANK_W = 22; // fits two-digit ranks
const AVATAR = 28;
const ROW_GAP = 9;
const DETAIL_INDENT = RANK_W + ROW_GAP + AVATAR + ROW_GAP;

export function GroupsScreen() {
  const g = useGroupsModel();

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title}>Groups</Text>
          <Text style={styles.subtitle}>Lowest screen time each day wins the point.</Text>
        </View>
        <Pressable
          onPress={g.openNewGroup}
          accessibilityRole="button"
          style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.newBtnText}>+ New group</Text>
        </Pressable>
      </View>

      {g.empty ? (
        <Card style={[styles.card, { alignItems: 'center', paddingVertical: 28 }]}>
          <Text style={styles.cardTitle}>You’re not in any groups</Text>
          <Text style={[styles.meta, { textAlign: 'center' }]}>
            Create one and invite friends or family to keep each other accountable.
          </Text>
        </Card>
      ) : (
        <GroupBody g={g} />
      )}
    </View>
  );
}

function GroupBody({ g }: { g: GroupsViewModel }) {
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segWrap}>
        {g.tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={t.onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: t.active }}
            style={[styles.segBtn, t.active && styles.segBtnActive]}
          >
            <Text style={[styles.segText, t.active && styles.segTextActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {g.pending.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.headRow}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>Invites pending</Text>
            <Text style={styles.meta}>{g.pendingNote}</Text>
          </View>
          {g.pending.map((p) => (
            <View key={p.id} style={styles.pendingRow}>
              <Avatar initial={p.initial} tone={color.accent} size={26} faded />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.name}>{p.name}</Text>
                <Text style={styles.meta}>{p.status}</Text>
              </View>
              <Pressable
                onPress={p.accept}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={'Simulate ' + p.name + ' accepting'}
              >
                <Text style={styles.accept}>Accept (demo)</Text>
              </Pressable>
              {p.cancel && (
                <Pressable
                  onPress={p.cancel}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={'Cancel invite to ' + p.name}
                >
                  <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
              )}
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.card}>
        <View style={styles.headRow}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.cardTitle}>Today so far</Text>
            <Text style={styles.meta}>{g.since}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{g.summary}</Text>
          </View>
        </View>

        {g.today.map((r) => (
          <View key={r.id} style={[styles.rankRow, r.you && styles.youRow]}>
            <View style={styles.rankLine}>
              <Text style={styles.rank}>{r.rank}</Text>
              <Avatar initial={r.initial} tone={r.color} size={AVATAR} />
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.total}>{r.total}</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${r.pct}%`, backgroundColor: r.rank === 1 ? color.teal : alpha(color.text, 22) }]}
              />
            </View>
            <View style={styles.topRow}>
              {r.top.map((c) => (
                <View key={c.name} style={styles.topItem}>
                  <Dot size={7} color={c.color} />
                  <Text style={styles.topText} numberOfLines={1}>
                    {c.name} {c.time}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.meta}>The point is awarded at midnight to the lowest full-day total. Ties each get a point.</Text>
      </Card>

      {g.yesterday !== '' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{g.yesterday}</Text>
        </View>
      )}

      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>Points · All time</Text>
          <Text style={styles.meta}>{g.boardNote}</Text>
        </View>
        {g.board.map((r, i: number) => (
          <View
            key={r.id}
            style={[styles.boardRow, r.you && styles.youRow, i === g.board.length - 1 && { borderBottomWidth: 0 }]}
          >
            <Text style={styles.rank}>{r.rank}</Text>
            <Avatar initial={r.initial} tone={r.color} size={AVATAR} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.meta}>
                {r.streak !== '' ? r.streak + ' · ' : ''}
                {r.best}
              </Text>
            </View>
            <Text style={styles.points}>{r.points}</Text>
          </View>
        ))}
      </Card>

      <Pressable onPress={g.openSettings} accessibilityRole="button">
        {({ pressed }) => (
          <Card style={[styles.settingsCard, pressed && { backgroundColor: '#fbfbfc' }]}>
            <SettingsIcon size={17} color={color.text} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.settingsTitle}>Group settings</Text>
              <Text style={g.settingsNote ? styles.settingsNote : styles.meta}>
                {g.settingsNote || 'Invite people, tracking rules, leave group'}
              </Text>
            </View>
            <ChevronRightIcon size={15} color={alpha(color.text, 45)} />
          </Card>
        )}
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: {
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 27,
    letterSpacing: -0.3,
    lineHeight: 30,
    color: color.text,
  },
  subtitle: { fontSize: 13, color: alpha(color.text, 55) },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  newBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.accent },
  newBtnText: { fontFamily: font.bodySemiBold, fontSize: 13, color: '#ffffff' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  cancel: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: color.roseDark },
  accept: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: color.tealDark },
  segWrap: { flexGrow: 1, flexDirection: 'row', gap: 4, backgroundColor: alpha(color.text, 7), borderRadius: 999, padding: 4 },
  segBtn: { flexGrow: 1, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center' },
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
  card: { padding: 14, gap: 8 },
  settingsCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  settingsTitle: { fontSize: 14.5, fontFamily: font.bodySemiBold, color: color.text },
  settingsNote: { fontSize: 11.5, fontFamily: font.bodySemiBold, color: color.roseDark },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  cardTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 19, letterSpacing: -0.2, color: color.text },
  meta: { fontSize: 11.5, color: alpha(color.text, 48) },
  chip: { paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: alpha(color.accent, 14) },
  chipText: { fontSize: 11.5, fontFamily: font.bodySemiBold, color: color.accent700 },
  rankRow: { gap: 6, padding: 8, marginHorizontal: -8, borderRadius: 12 },
  youRow: { backgroundColor: alpha(color.accent, 9) },
  rankLine: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP },
  rank: {
    width: RANK_W,
    textAlign: 'center',
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 16,
    color: alpha(color.text, 55),
  },
  name: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 14.5, color: color.text },
  total: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 17, color: color.text },
  track: { height: 5, marginLeft: DETAIL_INDENT, borderRadius: 999, backgroundColor: alpha(color.text, 6) },
  fill: { height: '100%', borderRadius: 999 },
  topRow: { flexDirection: 'row', gap: 10, marginLeft: DETAIL_INDENT },
  topItem: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  topText: { flexShrink: 1, fontSize: 11, color: alpha(color.text, 55) },
  banner: { backgroundColor: alpha(color.teal, 14), borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bannerText: { fontSize: 13, fontFamily: font.bodySemiBold, color: color.tealDark },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: 9,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  points: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 17, color: color.text },
});
