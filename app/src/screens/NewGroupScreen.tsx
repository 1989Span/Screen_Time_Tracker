import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { BackChip, Card, Dot } from '../components/ui';
import { ContactPicker } from '../components/ContactPicker';
import { useNewGroupModel } from '../models/groups';

export function NewGroupScreen() {
  const n = useNewGroupModel();

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <BackChip label="Groups" onPress={n.backToGroups} />
        <Text style={styles.title}>New group</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.cardTitle}>Name</Text>
          <Text style={styles.meta}>
            {n.name.length}/{n.nameMax}
          </Text>
        </View>
        <TextInput
          value={n.name}
          onChangeText={n.setName}
          placeholder="e.g. Work friends"
          placeholderTextColor={alpha(color.text, 35)}
          maxLength={n.nameMax}
          style={styles.input}
        />
      </Card>

      <Card style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.cardTitle}>Categories to track</Text>
          <Text style={styles.meta}>{n.trackedLabel}</Text>
        </View>
        <View style={styles.chips}>
          {n.categories.map((c) => (
            <Pressable
              key={c.id}
              onPress={c.onPress}
              style={[styles.catChip, c.on ? { backgroundColor: alpha(c.color, 14), borderColor: alpha(c.color, 40) } : null]}
            >
              <Dot size={8} color={c.on ? c.color : alpha(color.text, 20)} />
              <Text style={[styles.catChipText, !c.on && { color: alpha(color.text, 42), textDecorationLine: 'line-through' }]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.meta}>Invitees accept these rules when they join. Changing them later needs everyone to agree.</Text>
      </Card>

      <ContactPicker picker={n.picker} />

      {n.error !== '' && <Text style={styles.error}>{n.error}</Text>}
      <Pressable onPress={n.create} disabled={!n.canCreate} style={[styles.createBtn, !n.canCreate && { opacity: 0.4 }]}>
        <Text style={styles.createText}>Create group & send invites</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, letterSpacing: -0.2, color: color.text },
  card: { padding: 14, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 17, color: color.text },
  meta: { fontSize: 11.5, color: alpha(color.text, 48) },
  input: {
    borderWidth: 1,
    borderColor: alpha(color.text, 12),
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontFamily: font.bodySemiBold,
    fontSize: 14,
    color: color.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: alpha(color.text, 12),
  },
  catChipText: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: color.text },
  error: { textAlign: 'center', fontSize: 12, color: alpha(color.text, 50) },
  createBtn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: color.accent },
  createText: { fontFamily: font.bodySemiBold, fontSize: 14, color: '#ffffff' },
});
