import React from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ChevronRightIcon } from '../components/Icons';
import { Avatar, BackChip, Card } from '../components/ui';
import { useGroupSettingsModel } from '../models/groups';
import { GROUP_NAME_MAX } from '../state/groupsStore';
import { alpha, color } from '../theme';
import { g } from './groupStyles';

export function GroupSettingsScreen() {
  const s = useGroupSettingsModel();
  if (s === null) return null;

  return (
    <View style={g.wrap}>
      <View style={g.topRow}>
        <BackChip label="Group" onPress={s.back} />
        <Text style={[g.screenTitle, { flex: 1 }]} numberOfLines={1}>
          {s.name}
        </Text>
      </View>

      <Card style={g.card}>
        <Text style={g.cardTitle}>Members</Text>
        {s.members.map((m, i) => (
          <View key={m.id} style={[g.row, i === s.members.length - 1 && g.lastRow]}>
            <Avatar initial={m.initial} tone={m.color} size={28} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={g.name}>{m.name}</Text>
              <Text style={g.meta}>{m.detail}</Text>
            </View>
          </View>
        ))}
        <Pressable onPress={s.invite} accessibilityRole="button" style={g.secondary}>
          <Text style={g.secondaryText}>Invite someone</Text>
        </Pressable>
      </Card>

      <Pressable onPress={s.openRules} accessibilityRole="button">
        {({ pressed }) => (
          <Card
            style={[g.card, { flexDirection: 'row', alignItems: 'center' }, pressed && { backgroundColor: '#fbfbfc' }]}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={g.name}>Apps that count</Text>
              <Text style={g.meta}>{s.rulesNote}</Text>
            </View>
            <ChevronRightIcon size={15} color={alpha(color.text, 45)} />
          </Card>
        )}
      </Pressable>

      <Card style={g.card}>
        <Text style={g.label}>Your name in groups</Text>
        <TextInput
          value={s.selfName}
          onChangeText={s.setSelfName}
          maxLength={GROUP_NAME_MAX}
          accessibilityLabel="Your name in groups"
          style={g.input}
        />
        <Text style={g.meta}>The others see a change after the next sync.</Text>
      </Card>

      <Card style={g.card}>
        {/* System dialogs rather than inline confirmations: these are the last
            cards on the page, and an inline one opened below the visible area. */}
        <Pressable
          onPress={() =>
            Alert.alert(
              `Leave "${s.name}"?`,
              'Your numbers stop syncing to this group, and your past numbers are removed from it. You can rejoin from an invite, starting again from zero.',
              [
                { text: 'Stay', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: s.leave },
              ]
            )
          }
          accessibilityRole="button"
          style={[g.row]}
        >
          <Text style={[g.name, { color: color.roseDark }]}>Leave group</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Delete all your group data?',
              'This removes you from every group and deletes your name and daily totals from the group server. It can’t be undone. Your usage history on this phone is not affected.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: s.deleteMyData },
              ]
            )
          }
          accessibilityRole="button"
          style={[g.row, g.lastRow]}
        >
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={[g.name, { color: color.roseDark }]}>Delete my group data</Text>
            <Text style={g.meta}>Every group, from the server</Text>
          </View>
        </Pressable>
      </Card>
    </View>
  );
}
