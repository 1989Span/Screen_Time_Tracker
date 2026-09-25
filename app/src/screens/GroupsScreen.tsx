import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChevronRightIcon, SettingsIcon } from '../components/Icons';
import { Avatar, Card } from '../components/ui';
import { GroupsViewModel, useGroupsModel } from '../models/groups';
import { alpha, color, font } from '../theme';
import { g as gs } from './groupStyles';

// Ranking row geometry: the bar indents past the rank number and avatar, so
// derive the indent instead of hard-coding it.
const RANK_W = 22; // fits two-digit ranks
const AVATAR = 28;
const ROW_GAP = 9;
const DETAIL_INDENT = RANK_W + ROW_GAP + AVATAR + ROW_GAP;

export function GroupsScreen() {
  const m = useGroupsModel();

  return (
    <View style={gs.wrap}>
      <View style={gs.topRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={gs.title}>Groups</Text>
          <Text style={gs.subtitle}>Lowest screen time each day wins the point.</Text>
        </View>
        <Pressable
          onPress={m.openNewGroup}
          accessibilityRole="button"
          style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.newBtnText}>+ New group</Text>
        </Pressable>
      </View>

      {m.notice !== null && (
        <Pressable onPress={m.clearNotice} accessibilityRole="button" accessibilityHint="Dismiss" style={gs.banner}>
          <Text style={gs.bannerText}>{m.notice}</Text>
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      )}

      {m.empty ? <Empty m={m} /> : <GroupBody m={m} />}
    </View>
  );
}

function OpenLink({ m }: { m: GroupsViewModel }) {
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        value={m.link.value}
        onChangeText={m.link.onChange}
        placeholder="Paste a group link someone sent you"
        placeholderTextColor={alpha(color.text, 35)}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel="Group link"
        style={gs.input}
      />
      {m.link.error !== null && <Text style={gs.error}>{m.link.error}</Text>}
      <Pressable
        onPress={m.link.open}
        disabled={m.link.value.trim() === ''}
        accessibilityRole="button"
        style={[gs.secondary, m.link.value.trim() === '' && gs.disabled]}
      >
        <Text style={gs.secondaryText}>Open link</Text>
      </Pressable>
    </View>
  );
}

function Empty({ m }: { m: GroupsViewModel }) {
  return (
    <>
      <Card style={gs.card}>
        <Text style={gs.cardTitle}>How it works</Text>
        <Text style={gs.body}>
          Start a group and send the invite link to friends or family by text, WhatsApp or anything else. Each day,
          everyone taps Share my day to send their total to the group.
        </Text>
        <Text style={gs.body}>
          There are no accounts and no server. Your numbers only leave your phone inside the links you choose to send.
        </Text>
      </Card>
      <Card style={gs.card}>
        <Text style={gs.cardTitle}>Got an invite?</Text>
        <Text style={gs.meta}>Tapping the link usually opens Gauge. If it didn&rsquo;t, paste it here.</Text>
        <OpenLink m={m} />
      </Card>
    </>
  );
}

function GroupBody({ m }: { m: GroupsViewModel }) {
  return (
    <>
      {m.tabs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segWrap}>
          {m.tabs.map((t) => (
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
      )}

      <Card style={gs.card}>
        <View style={gs.headRow}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={gs.cardTitle}>Today so far</Text>
            <Text style={gs.meta}>{m.since}</Text>
          </View>
        </View>

        {m.today.map((r) => (
          <View key={r.id} style={[styles.rankRow, r.you && styles.youRow]}>
            <View style={styles.rankLine}>
              <Text style={styles.rank}>{r.rank ?? '·'}</Text>
              <Avatar initial={r.initial} tone={r.color} size={AVATAR} faded={r.rank === null} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={gs.name} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={gs.meta}>{r.note}</Text>
              </View>
              <Text style={styles.total}>{r.total}</Text>
            </View>
            {r.rank !== null && (
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    { width: `${r.pct}%`, backgroundColor: r.rank === 1 ? color.teal : alpha(color.text, 22) },
                  ]}
                />
              </View>
            )}
          </View>
        ))}

        <Pressable
          onPress={m.share}
          accessibilityRole="button"
          style={({ pressed }) => [gs.primary, { marginTop: 4 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={gs.primaryText}>{m.alone ? 'Invite someone' : 'Share my day'}</Text>
        </Pressable>
        <Text style={gs.meta}>
          {m.alone ? 'A group needs at least two people before points are awarded.' : m.lastShared}
        </Text>
      </Card>

      {m.yesterday !== '' && (
        <View style={gs.banner}>
          <Text style={gs.bannerText}>{m.yesterday}</Text>
        </View>
      )}

      {!m.alone && (
        <Card style={gs.card}>
          <View style={gs.headRow}>
            <Text style={[gs.cardTitle, { flex: 1 }]}>Points</Text>
            <Text style={gs.meta}>1 per day won</Text>
          </View>
          {m.board.map((r, i) => (
            <View key={r.id} style={[styles.boardRow, r.you && styles.youRow, i === m.board.length - 1 && gs.lastRow]}>
              <Text style={styles.rank}>{r.rank}</Text>
              <Avatar initial={r.initial} tone={r.color} size={AVATAR} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={gs.name}>{r.name}</Text>
                <Text style={gs.meta}>{r.detail}</Text>
              </View>
              <Text style={styles.points}>{r.points}</Text>
            </View>
          ))}
          <Text style={gs.meta}>
            A day is scored once everyone has shared it. Numbers come from each person&rsquo;s own phone.
          </Text>
        </Card>
      )}

      <Pressable onPress={m.openSettings} accessibilityRole="button">
        {({ pressed }) => (
          <Card style={[styles.settingsCard, pressed && { backgroundColor: '#fbfbfc' }]}>
            <SettingsIcon size={17} color={color.text} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.settingsTitle}>Group settings</Text>
              <Text style={m.settingsNote ? styles.settingsNote : gs.meta}>
                {m.settingsNote || 'Members, invite, apps that count, leave'}
              </Text>
            </View>
            <ChevronRightIcon size={15} color={alpha(color.text, 45)} />
          </Card>
        )}
      </Pressable>

      <Card style={gs.card}>
        <Text style={gs.label}>Open a group link</Text>
        <OpenLink m={m} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  newBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: color.accent },
  newBtnText: { fontFamily: font.bodySemiBold, fontSize: 13, color: '#ffffff' },
  dismiss: { fontSize: 14, color: color.tealDark, paddingHorizontal: 2 },
  segWrap: {
    flexGrow: 1,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: alpha(color.text, 7),
    borderRadius: 999,
    padding: 4,
  },
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
  settingsCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  settingsTitle: { fontSize: 14.5, fontFamily: font.bodySemiBold, color: color.text },
  settingsNote: { fontSize: 11.5, fontFamily: font.bodySemiBold, color: color.roseDark },
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
  total: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 17, color: color.text },
  track: { height: 5, marginLeft: DETAIL_INDENT, borderRadius: 999, backgroundColor: alpha(color.text, 6) },
  fill: { height: '100%', borderRadius: 999 },
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
