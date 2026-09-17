import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Avatar, BackChip, Card } from '../components/ui';
import { ChevronRightIcon } from '../components/Icons';
import { useGroupSettingsModel } from '../models/groups';

function Row({
  title,
  sub,
  note,
  onPress,
  last,
}: {
  title: string;
  sub: string;
  note?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.meta}>{sub}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <ChevronRightIcon size={15} color={alpha(color.text, 45)} />
    </Pressable>
  );
}

export function GroupSettingsScreen() {
  const s = useGroupSettingsModel();
  if (!s) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <BackChip label="Groups" onPress={s.backToGroups} />
        <Text style={styles.title} numberOfLines={1}>
          {s.name} settings
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.meta}>{s.memberLine}</Text>
        <View style={styles.members}>
          {s.members.map((m) => (
            <View key={m.id} style={styles.member}>
              <Avatar initial={m.initial} tone={m.color} size={32} />
              <Text style={styles.memberName} numberOfLines={1}>
                {m.name}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.listCard}>
        <Row title="Invite people" sub={s.inviteNote} onPress={s.openInvite} />
        <Row title="Tracking rules" sub={s.rulesLine} note={s.rulesNote} onPress={s.openRules} last />
      </Card>

      <Card style={styles.card}>
        {s.leaveConfirm ? (
          <>
            <Text style={styles.rowTitle}>Leave {s.name}?</Text>
            <Text style={styles.meta}>{s.leaveText}</Text>
            <View style={styles.actions}>
              <Pressable onPress={s.cancelLeave} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={s.leave} style={[styles.btn, styles.btnDanger]}>
                <Text style={styles.btnDangerText}>Leave group</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable onPress={s.askLeave} style={styles.leaveRow}>
            <Text style={styles.leaveText}>Leave group</Text>
          </Pressable>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, letterSpacing: -0.2, color: color.text },
  card: { padding: 14, gap: 10 },
  meta: { fontSize: 11.5, color: alpha(color.text, 48) },
  note: { fontSize: 11.5, fontFamily: font.bodySemiBold, color: color.roseDark },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  member: { width: 56, alignItems: 'center', gap: 4 },
  memberName: { fontSize: 11.5, fontFamily: font.bodySemiBold, color: color.text },
  listCard: { paddingHorizontal: 14, paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  rowTitle: { fontSize: 14.5, fontFamily: font.bodySemiBold, color: color.text },
  leaveRow: { alignItems: 'center', paddingVertical: 2 },
  leaveText: { fontSize: 14, fontFamily: font.bodySemiBold, color: color.roseDark },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: alpha(color.text, 14) },
  btnGhostText: { fontFamily: font.bodySemiBold, fontSize: 13, color: color.text },
  btnDanger: { backgroundColor: color.rose },
  btnDangerText: { fontFamily: font.bodySemiBold, fontSize: 13, color: '#ffffff' },
});
