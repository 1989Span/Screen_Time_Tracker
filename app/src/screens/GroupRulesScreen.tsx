import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { BackChip, Card } from '../components/ui';
import { RuleRow, useGroupRulesModel } from '../models/groups';
import { g } from './groupStyles';

function Rows({ rows }: { rows: RuleRow[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <View key={r.app} style={[g.row, i === rows.length - 1 && g.lastRow]}>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={g.name} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={g.meta}>{r.detail}</Text>
          </View>
          {r.secondary && (
            <Pressable onPress={r.secondary.onPress} accessibilityRole="button" hitSlop={6} style={g.smallQuiet}>
              <Text style={g.smallQuietText}>{r.secondary.label}</Text>
            </Pressable>
          )}
          {r.primary && (
            <Pressable onPress={r.primary.onPress} accessibilityRole="button" hitSlop={6} style={g.smallBtn}>
              <Text style={g.smallBtnText}>{r.primary.label}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </>
  );
}

export function GroupRulesScreen() {
  const r = useGroupRulesModel();
  if (r === null) return null;

  return (
    <View style={g.wrap}>
      <View style={g.topRow}>
        <BackChip label="Settings" onPress={r.back} />
        <Text style={g.screenTitle}>Apps that count</Text>
      </View>

      <Text style={g.subtitle}>
        Every app counts for everyone, unless the whole group agrees to leave one out, like music playing in the
        background or maps while driving. Anyone can bring an app back. Your votes reach the others the next time you
        share.
      </Text>

      {r.alone && (
        <Card style={g.card}>
          <Text style={g.body}>
            Nothing can be left out until someone else joins, since one person can&rsquo;t decide alone.
          </Text>
        </Card>
      )}

      {r.excluded.length > 0 && (
        <Card style={g.card}>
          <Text style={g.cardTitle}>Left out</Text>
          <Rows rows={r.excluded} />
        </Card>
      )}

      {r.proposals.length > 0 && (
        <Card style={g.card}>
          <Text style={g.cardTitle}>Proposals</Text>
          <Rows rows={r.proposals} />
        </Card>
      )}

      <Card style={g.card}>
        <Text style={g.cardTitle}>Propose leaving out</Text>
        {r.suggestions.length === 0 ? (
          <Text style={g.meta}>Your most-used apps show up here once Gauge has recorded some usage.</Text>
        ) : (
          <>
            <Text style={g.meta}>
              Your most-used apps this week, visible only to you. Proposing one shares its name with the group.
            </Text>
            <Rows rows={r.suggestions} />
          </>
        )}
      </Card>
    </View>
  );
}
