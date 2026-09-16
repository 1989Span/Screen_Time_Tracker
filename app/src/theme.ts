// Ported from project/_ds/industry-.../styles.css — Industry design system tokens.
// `color-mix(in srgb, X Y%, transparent)` in the source always mixes toward
// transparent, which is just X at Y% alpha — `alpha()` below reproduces that.

export const color = {
  bg: '#f2f2f3',
  surface: '#e9e9ea',
  text: '#1d1f20',
  accent: '#5980a6',
  accent2: '#728fab',
  divider: '#1d1f20',

  accent100: '#eef6ff',
  accent200: '#d6ebff',
  accent300: '#b5d9fd',
  accent400: '#94bce3',
  accent500: '#749dc4',
  accent600: '#597ea3',
  accent700: '#416180',
  accent800: '#2c455d',
  accent900: '#1d2d3d',

  rose: '#b5576b',
  roseDark: '#8e3f52',
  teal: '#4f8c7b',
  tealDark: '#2f6355',
};

// Modern pass (turn 3a) ground — a hair cooler/lighter than --color-bg,
// used deliberately in the mockup for the white-card layer.
export const modernBg = '#f3f4f6';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  const int = parseInt(n, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** X at `pct`% opacity over its own background — i.e. color-mix(...,X pct%,transparent). */
export function alpha(hex: string, pct: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${pct / 100})`;
}

export const font = {
  heading: 'BarlowCondensed_600SemiBold',
  headingBold: 'BarlowCondensed_700Bold',
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemiBold: 'Barlow_600SemiBold',
  bodyBold: 'Barlow_700Bold',
};

// One fixed color per category, in CATS order (Social, Video, Work,
// Messaging, Games, Music, Reading) — harmonised around the steel accent.
export const CCOL = ['#5980a6', '#b5576b', '#4f8c7b', '#6e71b8', '#c98a3e', '#8a6ca8', '#6f8a45'];

export const shadow = {
  card: {
    shadowColor: '#1d1f20',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 3,
  },
  chip: {
    shadowColor: '#1d1f20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
};
