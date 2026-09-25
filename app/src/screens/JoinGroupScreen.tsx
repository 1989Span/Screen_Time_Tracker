import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Card } from '../components/ui';
import { useJoinModel } from '../models/groups';
import { GROUP_NAME_MAX } from '../state/groupsStore';
import { alpha, color } from '../theme';
import { g } from './groupStyles';

/** Shown when a group link arrives for a group you're not in yet. */
export function JoinGroupScreen() {
  const j = useJoinModel();

  if (j === null) {
    return (
      <Card style={g.card}>
        <Text style={g.body}>There&rsquo;s no invite waiting. Open the link you were sent again.</Text>
      </Card>
    );
  }

  return (
    <View style={g.wrap}>
      <View style={{ gap: 2 }}>
        <Text style={g.label}>Group invite</Text>
        <Text style={g.title}>{j.name}</Text>
        <Text style={g.subtitle}>{j.from}</Text>
      </View>

      <Card style={g.card}>
        <Text style={g.label}>Members</Text>
        <Text style={g.body}>{j.members}</Text>

        <Text style={[g.label, { marginTop: 6 }]}>Your name in groups</Text>
        <TextInput
          value={j.selfName}
          onChangeText={j.setSelfName}
          placeholder="What the others will see"
          placeholderTextColor={alpha(color.text, 35)}
          maxLength={GROUP_NAME_MAX}
          accessibilityLabel="Your name in groups"
          style={g.input}
        />
      </Card>

      <Card style={g.card}>
        <Text style={g.body}>
          Joining shares nothing yet. The others see your name and daily totals, never which apps you used, once you tap
          Share my day and send them the link.
        </Text>
      </Card>

      <Pressable
        onPress={j.join}
        disabled={!j.canJoin}
        accessibilityRole="button"
        style={[g.primary, !j.canJoin && g.disabled]}
      >
        <Text style={g.primaryText}>Join group</Text>
      </Pressable>
      <Pressable onPress={j.notNow} accessibilityRole="button" style={g.secondary}>
        <Text style={g.secondaryText}>Not now</Text>
      </Pressable>
    </View>
  );
}
