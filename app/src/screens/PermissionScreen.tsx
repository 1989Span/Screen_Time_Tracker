import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/ui';
import { usePermissionModel } from '../models/setup';
import { alpha, color, font } from '../theme';

/**
 * Asks for usage access.
 *
 * There is no runtime prompt for PACKAGE_USAGE_STATS and no grant callback, so
 * this screen deep-links into Settings and the app re-checks when it returns to
 * the foreground (see App.tsx). Numbered steps because the Settings screen it
 * opens is a bare list of app names with no explanation of why it is being shown.
 */
export function PermissionScreen() {
  const m = usePermissionModel();

  return (
    <View style={styles.wrap}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{m.title}</Text>
        <Text style={styles.subtitle}>{m.body}</Text>
      </View>

      <Card style={styles.card}>
        {m.steps.map((step, i) => (
          <View key={step} style={[styles.step, i === m.steps.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </Card>

      <Pressable
        onPress={m.openSettings}
        accessibilityRole="button"
        accessibilityLabel={m.buttonLabel}
        style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.primaryText}>{m.buttonLabel}</Text>
      </Pressable>

      <Pressable onPress={m.recheck} accessibilityRole="button" hitSlop={8} style={styles.secondary}>
        <Text style={styles.secondaryText}>I&rsquo;ve switched it on — check again</Text>
      </Pressable>

      {m.error !== null && <Text style={styles.error}>{m.error}</Text>}

      <Text style={styles.footnote}>
        Gauge stores everything on this device. There is no account and no server to send it to.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 24, letterSpacing: -0.2, color: color.text },
  subtitle: { fontSize: 13.5, lineHeight: 20, color: alpha(color.text, 60) },
  card: { paddingHorizontal: 16, paddingVertical: 4 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(color.accent, 16),
  },
  badgeText: { fontFamily: font.bodyBold, fontSize: 12.5, color: color.accent700 },
  stepText: { flex: 1, fontSize: 14.5, fontFamily: font.bodySemiBold, color: color.text },
  primary: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: color.accent,
  },
  primaryText: { fontFamily: font.bodySemiBold, fontSize: 14.5, color: '#ffffff' },
  secondary: { alignItems: 'center', paddingVertical: 4 },
  secondaryText: { fontFamily: font.bodySemiBold, fontSize: 13, color: color.accent700 },
  error: { fontSize: 12.5, color: color.roseDark },
  footnote: { fontSize: 11.5, lineHeight: 17, color: alpha(color.text, 42) },
});
