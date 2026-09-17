import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { Avatar, Card } from './ui';
import { ContactPickerViewModel } from '../models/groups';

export function ContactPicker({ picker, title = 'Invite from contacts' }: { picker: ContactPickerViewModel; title?: string }) {
  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.meta}>{picker.summary}</Text>
      </View>
      <TextInput
        value={picker.query}
        onChangeText={picker.setQuery}
        placeholder="Search name or number"
        placeholderTextColor={alpha(color.text, 35)}
        style={styles.input}
      />
      <View>
        {picker.contacts.map((c, i: number) => (
          <Pressable
            key={c.id}
            onPress={c.onPress}
            disabled={c.disabled}
            style={[styles.row, i === picker.contacts.length - 1 && { borderBottomWidth: 0 }, c.disabled && { opacity: 0.5 }]}
          >
            <Avatar initial={c.initial} tone={c.hasApp ? color.accent : alpha(color.text, 35)} size={30} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={[styles.meta, c.hasApp && !c.disabled && { color: color.tealDark }]}>{c.via}</Text>
            </View>
            {!c.disabled && (
              <View style={[styles.check, c.on && styles.checkOn]}>{c.on && <Text style={styles.checkMark}>✓</Text>}</View>
            )}
          </Pressable>
        ))}
        {picker.contacts.length === 0 && <Text style={[styles.meta, { paddingVertical: 10 }]}>No contacts match.</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  name: { fontSize: 14, fontFamily: font.bodySemiBold, color: color.text },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: alpha(color.text, 25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.accent, borderColor: color.accent },
  checkMark: { color: '#ffffff', fontSize: 13, fontFamily: font.bodyBold, lineHeight: 15 },
});
