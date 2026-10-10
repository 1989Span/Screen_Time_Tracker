import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { Card } from '../components/ui';
import { useJoinModel } from '../models/groups';
import { GROUP_NAME_MAX } from '../state/groupsStore';
import { alpha, color } from '../theme';
import { g } from './groupStyles';

/**
 * Shown when an invite link arrives. This is where someone agrees to automatic
 * sharing, once, so it says exactly what is shared, with whom, and how to stop.
 */
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
        <Text style={g.label}>Your name in groups</Text>
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
        <Text style={g.cardTitle}>What you&rsquo;re agreeing to</Text>
        <Text style={g.body}>
          From now on, Right Now will automatically send your name and your total screen time for each day to the group,
          about once an hour, so the points stay accurate. Everyone in the group can see them.
        </Text>
        <Text style={g.body}>
          It never sends which apps you used, only daily totals. You can leave the group, or delete your group data, at
          any time in Group settings.
        </Text>
      </Card>

      {j.error !== null && <Text style={g.error}>{j.error}</Text>}

      <Pressable
        onPress={j.join}
        disabled={!j.canJoin}
        accessibilityRole="button"
        style={[g.primary, !j.canJoin && g.disabled]}
      >
        {j.busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={g.primaryText}>Join and share automatically</Text>
        )}
      </Pressable>
      <Pressable onPress={j.notNow} accessibilityRole="button" style={g.secondary}>
        <Text style={g.secondaryText}>Not now</Text>
      </Pressable>
    </View>
  );
}
