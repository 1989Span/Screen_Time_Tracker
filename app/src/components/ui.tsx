import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { alpha, color, font, shadow } from '../theme';
import { BackIcon } from './Icons';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
      {icon}
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export function BackChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.backChip, pressed && styles.chipPressed]}>
      <BackIcon size={16} color={color.text} />
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

export function CompositionBar({
  segments,
  height = 8,
}: {
  segments: { w: number; color: string }[];
  height?: number;
}) {
  return (
    <View style={[styles.compBar, { height, borderRadius: height / 2 }]}>
      {segments.map((s, i) => (
        <View key={i} style={{ width: `${s.w}%`, backgroundColor: s.color }} />
      ))}
    </View>
  );
}

export function Dot({ size = 10, color: c }: { size?: number; color: string }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, flexShrink: 0 }} />;
}

export function Avatar({
  initial,
  tone,
  size = 28,
  faded = false,
}: {
  initial: string;
  tone: string;
  size?: number;
  faded?: boolean;
}) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        faded ? { borderWidth: 1.5, borderColor: alpha(tone, 45), borderStyle: 'dashed' } : { backgroundColor: tone },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.46, color: faded ? alpha(tone, 70) : '#ffffff' }]}>
        {initial}
      </Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontFamily: font.bodyBold },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    ...shadow.card,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
    ...shadow.chip,
  },
  backChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 14,
    ...shadow.chip,
  },
  chipPressed: { backgroundColor: '#fbfbfc' },
  chipText: { fontFamily: font.bodySemiBold, fontSize: 12.5, color: color.text },
  compBar: { width: '100%', flexDirection: 'row', gap: 2, overflow: 'hidden' },
});
