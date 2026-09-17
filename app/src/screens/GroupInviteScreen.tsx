import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme';
import { BackChip } from '../components/ui';
import { ContactPicker } from '../components/ContactPicker';

export function GroupInviteScreen({ model }: { model: any }) {
  const iv = model.groupInvite;
  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <BackChip label="Settings" onPress={model.backToGroupSettings} />
        <Text style={styles.title} numberOfLines={1}>
          Invite to {iv.name}
        </Text>
      </View>

      <ContactPicker picker={iv.picker} title="Contacts" />

      <Pressable onPress={iv.send} disabled={!iv.canSend} style={[styles.sendBtn, !iv.canSend && { opacity: 0.4 }]}>
        <Text style={styles.sendText}>Send invites</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, letterSpacing: -0.2, color: color.text },
  sendBtn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: color.accent },
  sendText: { fontFamily: font.bodySemiBold, fontSize: 14, color: '#ffffff' },
});
