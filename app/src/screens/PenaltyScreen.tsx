import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { alpha, color, font } from '../theme';
import { BackChip, Card } from '../components/ui';
import { PresetButton, usePenaltyEditorModel } from '../models/penalty';

function PresetRow({ items }: { items: PresetButton[] }) {
  return (
    <View style={styles.presetRow}>
      {items.map((p) => (
        <Pressable
          key={p.v}
          onPress={p.onPress}
          style={[styles.preset, p.active && { backgroundColor: color.accent, borderColor: color.accent }]}
        >
          <Text style={[styles.presetText, p.active && { color: '#ffffff' }]}>{p.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

interface FieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  prefix?: string;
  suffix?: string;
  error: boolean;
  keyboardType: 'number-pad' | 'decimal-pad';
  maxLength?: number;
}

function Field({ value, onChangeText, placeholder, prefix, suffix, error, keyboardType, maxLength }: FieldProps) {
  const active = value !== '';
  return (
    <View style={[styles.field, active && { borderColor: color.accent }, error && { borderColor: color.rose }]}>
      {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={alpha(color.text, 35)}
        keyboardType={keyboardType}
        maxLength={maxLength}
        style={styles.input}
      />
      {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
    </View>
  );
}

export function PenaltyScreen() {
  const e = usePenaltyEditorModel();

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <BackChip label="Overview" onPress={e.goOverview} />
        <Text style={styles.title}>{e.heading}</Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>This month</Text>
          <Text style={styles.statusValue}>{e.activeText}</Text>
        </View>
        {e.status !== '' && <Text style={[styles.hint, styles.pending]}>{e.status}</Text>}
      </Card>

      {e.review ? (
        <Card style={[styles.card, styles.reviewCard]}>
          <Text style={styles.sectionTitle}>{e.review.title}</Text>
          {e.review.lines.map((line, i) => (
            <Text key={i} style={styles.reviewLine}>
              {line}
            </Text>
          ))}
          <View style={[styles.actions, { marginTop: 6 }]}>
            <Pressable onPress={e.review.cancel} style={[styles.btn, styles.removeBtn]}>
              <Text style={styles.backText}>Go back</Text>
            </Pressable>
            <Pressable onPress={e.review.confirm} style={[styles.btn, styles.saveBtn]}>
              <Text style={styles.saveText}>{e.review.confirmLabel}</Text>
            </Pressable>
          </View>
        </Card>
      ) : e.mode === 'locked' ? (
        <Card style={styles.card}>
          <Text style={styles.hint}>{e.lockNote}</Text>
        </Card>
      ) : (
        <>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Daily limit</Text>
            <PresetRow items={e.limitPresets.slice(0, 4)} />
            <PresetRow items={e.limitPresets.slice(4)} />
            <View style={styles.customRow}>
              <Text style={styles.customLabel}>Custom</Text>
              <Field
                value={e.limitH}
                onChangeText={e.setLimitH}
                placeholder="0"
                suffix="hr"
                keyboardType="number-pad"
                maxLength={2}
                error={e.limitError !== ''}
              />
              <Field
                value={e.limitM}
                onChangeText={e.setLimitM}
                placeholder="0"
                suffix="min"
                keyboardType="number-pad"
                maxLength={2}
                error={e.limitError !== ''}
              />
            </View>
            {e.limitError !== '' && <Text style={styles.error}>{e.limitError}</Text>}

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Charge per minute over</Text>
            <PresetRow items={e.ratePresets} />
            <View style={styles.customRow}>
              <Text style={styles.customLabel}>Custom</Text>
              <Field
                value={e.rateText}
                onChangeText={e.setRateText}
                placeholder="0.00"
                prefix="$"
                keyboardType="decimal-pad"
                error={e.rateError !== ''}
              />
            </View>
            {e.rateError !== '' && <Text style={styles.error}>{e.rateError}</Text>}

            <View style={styles.divider} />

            <Text style={styles.summary}>{e.summary}</Text>
            <Text style={styles.hint}>{e.lockNote}</Text>
          </Card>

          <View style={styles.actions}>
            {e.turnOff && (
              <Pressable onPress={e.turnOff} style={[styles.btn, styles.removeBtn]}>
                <Text style={styles.removeText}>Turn off</Text>
              </Pressable>
            )}
            {e.keep && (
              <Pressable onPress={e.keep} style={[styles.btn, styles.removeBtn]}>
                <Text style={styles.backText}>Keep as is</Text>
              </Pressable>
            )}
            <Pressable
              onPress={e.save}
              disabled={!e.canSave}
              style={[styles.btn, styles.saveBtn, !e.canSave && { opacity: 0.4 }]}
            >
              <Text style={styles.saveText}>{e.saveLabel}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flex: 1,
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 22,
    letterSpacing: -0.2,
    color: color.text,
  },
  card: { padding: 14, gap: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusLabel: { fontSize: 12.5, color: alpha(color.text, 52) },
  statusValue: { fontSize: 13, fontFamily: font.bodySemiBold, color: color.text },
  pending: { color: color.accent700 },
  divider: { height: 1, backgroundColor: alpha(color.text, 7), marginVertical: 2 },
  sectionTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 15, color: color.text },
  presetRow: { flexDirection: 'row', gap: 6 },
  preset: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: alpha(color.text, 12),
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  presetText: { fontFamily: font.bodySemiBold, fontSize: 13, color: color.text },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customLabel: { width: 52, fontSize: 12.5, fontFamily: font.bodySemiBold, color: alpha(color.text, 55) },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: alpha(color.text, 12),
    paddingHorizontal: 10,
  },
  affix: { fontFamily: font.bodySemiBold, fontSize: 12.5, color: alpha(color.text, 50) },
  input: { flex: 1, minWidth: 0, paddingVertical: 8, fontFamily: font.bodySemiBold, fontSize: 13.5, color: color.text },
  error: { fontSize: 11.5, color: color.roseDark },
  summary: { fontSize: 13, fontFamily: font.bodySemiBold, color: color.text },
  hint: { fontSize: 11.5, lineHeight: 16, color: alpha(color.text, 50) },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  saveBtn: { flex: 2, backgroundColor: color.accent },
  saveText: { fontFamily: font.bodySemiBold, fontSize: 13.5, color: '#ffffff' },
  removeBtn: { flex: 1, borderWidth: 1, borderColor: alpha(color.text, 14) },
  removeText: { fontFamily: font.bodySemiBold, fontSize: 13.5, color: color.roseDark },
  backText: { fontFamily: font.bodySemiBold, fontSize: 13.5, color: color.text },
  reviewCard: { borderWidth: 1, borderColor: color.accent },
  reviewLine: { fontSize: 13, lineHeight: 19, color: alpha(color.text, 75) },
});
