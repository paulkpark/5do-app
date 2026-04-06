/**
 * 5DO Design System — Design Tokens
 * Based on Apple HIG, Dark Theme First
 *
 * Usage in React Native:
 *   import { Colors, Typography, Spacing } from '@/styles/design-tokens';
 *   const styles = StyleSheet.create({ container: { backgroundColor: Colors.bg } });
 */

// ═══════════════════════════════════════════
//  Colors
// ═══════════════════════════════════════════

export const Colors = {
  // Backgrounds
  bg:          '#0A0A0F',
  bgElevated:  '#141420',
  bgCard:      '#1A1A2E',
  surface:     '#252540',
  border:      '#2A2A45',

  // Primary
  primary:      '#7C5CFC',
  primaryLight: '#9B7FFF',
  primaryDark:  '#5A3AD9',

  // Secondary & Accents
  secondary:  '#3ECFCF',
  accent:     '#FF6B9D',
  accentWarm: '#FFB86C',

  // Semantic
  success: '#4ADE80',
  warning: '#FBBF24',
  error:   '#F87171',

  // Text
  textPrimary:   '#F0F0FF',
  textSecondary: '#A0A0C0',
  textTertiary:  '#6B6B8D',

  // Glass overlay
  glass: 'rgba(26, 26, 46, 0.7)',

  // Gradients (start/end pairs)
  gradientPrimary: ['#7C5CFC', '#5A3AD9'] as const,
  gradientAccent:  ['#FF6B9D', '#FF8A65'] as const,
  gradientAurora:  ['#7C5CFC', '#3ECFCF'] as const,
} as const;

// ═══════════════════════════════════════════
//  Typography
// ═══════════════════════════════════════════

export const FontFamily = {
  display: 'SF Pro Display',
  text:    'SF Pro Text',
  mono:    'SF Mono',
} as const;

export const Typography = {
  display: {
    fontFamily: FontFamily.display,
    fontSize: 48,
    fontWeight: '800' as const,
    letterSpacing: -2,
  },
  title1: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  title2: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    fontWeight: '700' as const,
  },
  title3: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  body: {
    fontFamily: FontFamily.text,
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22.5, // 15 * 1.5
  },
  caption: {
    fontFamily: FontFamily.text,
    fontSize: 12,
    fontWeight: '400' as const,
  },
  overline: {
    fontFamily: FontFamily.mono,
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
} as const;

// ═══════════════════════════════════════════
//  Spacing (4px base unit)
// ═══════════════════════════════════════════

export const Spacing = {
  xxs: 4,    // 1 unit
  xs:  8,    // 2 units
  sm:  12,   // 3 units
  md:  16,   // 4 units — content margin
  lg:  24,   // 6 units — card padding
  xl:  32,   // 8 units — section gap
  xxl: 48,   // 12 units — large section gap
} as const;

// ═══════════════════════════════════════════
//  Border Radius
// ═══════════════════════════════════════════

export const Radius = {
  sm:   8,
  md:   12,
  lg:   14,   // cards
  xl:   20,   // modals, sheets
  full: 9999, // pills, circular
} as const;

// ═══════════════════════════════════════════
//  Sizes
// ═══════════════════════════════════════════

export const Sizes = {
  touchTarget: 44,  // minimum touch target (Apple HIG)
  iconDefault: 20,
  iconLarge:   24,
  inputHeight: 48,
  tabBarHeight: 49,
  headerHeight: 44,
  playerThumbSm: 56,
  playerThumbLg: 280,
} as const;

// ═══════════════════════════════════════════
//  Shadows
// ═══════════════════════════════════════════

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 16,
  },
  glow: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 0,
  },
} as const;

// ═══════════════════════════════════════════
//  Animation
// ═══════════════════════════════════════════

export const Animation = {
  fast:    150,
  normal:  250,
  slow:    400,
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 1,
  },
} as const;

// ═══════════════════════════════════════════
//  Z-Index
// ═══════════════════════════════════════════

export const ZIndex = {
  base:       0,
  card:       1,
  sticky:     10,
  header:     20,
  overlay:    50,
  modal:      100,
  toast:      200,
} as const;
