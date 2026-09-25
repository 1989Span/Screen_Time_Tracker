import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BackChip, Card } from '../components/ui';
import { useNewGroupModel } from '../models/groups';
import { GROUP_NAME_MAX } from '../state/groupsStore';
import { alpha, color } from '../theme';
import { g } from './groupStyles';

export function NewGroupScreen() {
  const n = useNewGroupModel();

  return (
    <View style={g.wrap}>
      <View style={g.topRow}>
        <BackChip label="Groups" onPress={n.back} />
        <Text style={g.screenTitle}>New group</Text>
      </View>

      <Card style={g.card}>
        <View style={g.headRow}>
          <Text style={[g.label, { flex: 1 }]}>Group name</Text>
          <Text style={g.meta}>
            {n.name.length}/{GROUP_NAME_MAX}
          </Text>
        </View>
        <TextInput
          value={n.name}
          onChangeText={n.setName}
          placeholder="e.g. Family"
          placeholderTextColor={alpha(color.text, 35)}
          maxLength={GROUP_NAME_MAX}
          accessibilityLabel="Group name"
          style={g.input}
        />

        <Text style={[g.label, { marginTop: 6 }]}>Your name in groups</Text>
        <TextInput
          value={n.selfName}
          onChangeText={n.setSelfName}
          placeholder="What the others will see"
          placeholderTextColor={alpha(color.text, 35)}
          maxLength={GROUP_NAME_MAX}
          accessibilityLabel="Your name in groups"
          style={g.input}
        />
      </Card>

      <Card style={g.card}>
        <Text style={g.cardTitle}>What gets shared</Text>
        <Text style={g.body}>
          Your name and your total screen time for each day. Never which apps you used. Every app counts, unless the
          whole group agrees to leave one out.
        </Text>
        <Text style={g.body}>
          It only goes out in links you send yourself, from the share sheet, to whoever you choose.
        </Text>
      </Card>

      <Pressable
        onPress={n.create}
        disabled={!n.canCreate}
        accessibilityRole="button"
        style={[g.primary, !n.canCreate && g.disabled]}
      >
        <Text style={g.primaryText}>Create and invite</Text>
      </Pressable>
    </View>
  );
}
