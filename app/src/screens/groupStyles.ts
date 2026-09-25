// Styles shared by the Groups screens, so the five of them stay consistent.

import { StyleSheet } from 'react-native';

import { alpha, color, font } from '../theme';

export const g = StyleSheet.create({
  wrap: { gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    fontFamily: font.headingBold,
    fontWeight: '700',
    fontSize: 27,
    letterSpacing: -0.3,
    lineHeight: 30,
    color: color.text,
  },
  screenTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, color: color.text },
  subtitle: { fontSize: 13, lineHeight: 19, color: alpha(color.text, 55) },
  card: { padding: 14, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  cardTitle: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 19, letterSpacing: -0.2, color: color.text },
  label: { fontSize: 12.5, fontFamily: font.bodySemiBold, color: alpha(color.text, 60) },
  meta: { fontSize: 11.5, lineHeight: 16, color: alpha(color.text, 48) },
  body: { fontSize: 13.5, lineHeight: 20, color: alpha(color.text, 70) },
  name: { flex: 1, fontFamily: font.bodySemiBold, fontSize: 14.5, color: color.text },
  input: {
    backgroundColor: alpha(color.text, 5),
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    fontSize: 15,
    color: color.text,
  },
  primary: { paddingVertical: 13, borderRadius: 999, backgroundColor: color.accent, alignItems: 'center' },
  primaryText: { fontFamily: font.bodySemiBold, fontSize: 15, color: '#ffffff' },
  secondary: {
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: alpha(color.accent, 12),
    alignItems: 'center',
  },
  secondaryText: { fontFamily: font.bodySemiBold, fontSize: 14.5, color: color.accent700 },
  smallBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: alpha(color.accent, 12) },
  smallBtnText: { fontFamily: font.bodySemiBold, fontSize: 12.5, color: color.accent700 },
  smallQuiet: { paddingVertical: 7, paddingHorizontal: 10 },
  smallQuietText: { fontFamily: font.bodySemiBold, fontSize: 12.5, color: alpha(color.text, 50) },
  disabled: { opacity: 0.4 },
  error: { fontSize: 12.5, lineHeight: 18, color: color.roseDark },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: alpha(color.teal, 14),
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: font.bodySemiBold, color: color.tealDark },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: alpha(color.text, 7),
  },
  lastRow: { borderBottomWidth: 0 },
});
