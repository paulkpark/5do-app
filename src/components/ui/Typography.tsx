/**
 * 5DO Typography Components
 * Dynamic Type ready — maxFontSizeMultiplier limits extreme scaling
 * while still respecting accessibility preferences.
 */
import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { Colors, Typography as Typo, FontFamily } from '@/styles/design-tokens';

interface TypographyProps extends TextProps {
  children: React.ReactNode;
  color?: string;
  align?: TextStyle['textAlign'];
}

// Max font scale per level — larger text scales less
const SCALE_LIMITS = {
  display: 1.15,
  title1: 1.2,
  title2: 1.25,
  title3: 1.25,
  body: 1.35,
  caption: 1.3,
  overline: 1.2,
};

function createTypographyComponent(
  name: string,
  baseStyle: TextStyle,
  maxScale: number,
  defaultColor: string = Colors.textPrimary,
) {
  const Component: React.FC<TypographyProps> = ({
    children,
    color,
    align,
    style,
    accessibilityLabel,
    accessibilityHint,
    ...rest
  }) => (
    <Text
      style={[baseStyle, { color: color || defaultColor }, align ? { textAlign: align } : null, style]}
      maxFontSizeMultiplier={maxScale}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      {...rest}
    >
      {children}
    </Text>
  );
  Component.displayName = name;
  return Component;
}

// ═══════════════════════════════════════════
//  Exported Components
// ═══════════════════════════════════════════

export const Display = createTypographyComponent(
  'Display',
  styles.display,
  SCALE_LIMITS.display,
);

export const Title1 = createTypographyComponent(
  'Title1',
  styles.title1,
  SCALE_LIMITS.title1,
);

export const Title2 = createTypographyComponent(
  'Title2',
  styles.title2,
  SCALE_LIMITS.title2,
);

export const Title3 = createTypographyComponent(
  'Title3',
  styles.title3,
  SCALE_LIMITS.title3,
);

export const Body = createTypographyComponent(
  'Body',
  styles.body,
  SCALE_LIMITS.body,
);

export const Caption = createTypographyComponent(
  'Caption',
  styles.caption,
  SCALE_LIMITS.caption,
  Colors.textSecondary,
);

export const Overline = createTypographyComponent(
  'Overline',
  styles.overline,
  SCALE_LIMITS.overline,
  Colors.textTertiary,
);

// ═══════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════

const styles = StyleSheet.create({
  display: {
    fontFamily: FontFamily.display,
    fontSize: Typo.display.fontSize,
    fontWeight: Typo.display.fontWeight,
    letterSpacing: Typo.display.letterSpacing,
    color: Colors.textPrimary,
  },
  title1: {
    fontFamily: FontFamily.display,
    fontSize: Typo.title1.fontSize,
    fontWeight: Typo.title1.fontWeight,
    letterSpacing: Typo.title1.letterSpacing,
    color: Colors.textPrimary,
  },
  title2: {
    fontFamily: FontFamily.display,
    fontSize: Typo.title2.fontSize,
    fontWeight: Typo.title2.fontWeight,
    color: Colors.textPrimary,
  },
  title3: {
    fontFamily: FontFamily.display,
    fontSize: Typo.title3.fontSize,
    fontWeight: Typo.title3.fontWeight,
    color: Colors.textPrimary,
  },
  body: {
    fontFamily: FontFamily.text,
    fontSize: Typo.body.fontSize,
    fontWeight: Typo.body.fontWeight,
    lineHeight: Typo.body.lineHeight,
    color: Colors.textPrimary,
  },
  caption: {
    fontFamily: FontFamily.text,
    fontSize: Typo.caption.fontSize,
    fontWeight: Typo.caption.fontWeight,
    color: Colors.textSecondary,
  },
  overline: {
    fontFamily: FontFamily.mono,
    fontSize: Typo.overline.fontSize,
    fontWeight: Typo.overline.fontWeight,
    letterSpacing: Typo.overline.letterSpacing,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },
});
