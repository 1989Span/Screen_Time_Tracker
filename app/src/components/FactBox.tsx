import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { SparkleIcon } from './Icons';

export function FactBox({ text }: { text: string }) {
  return (
    <View style={styles.wrap}>
      <SparkleIcon size={15} color={color.accent700} strokeWidth={1.5} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: alpha(color.accent, 11),
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  text: {
    flex: 1,
    fontFamily: font.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: color.accent900,
  },
});
