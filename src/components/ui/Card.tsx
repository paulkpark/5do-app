/**
 * 5DO Card Components
 * Variants: Base, NowPlayingCard, FrequencyCard
 */
import React from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, ImageSourcePropType } from 'react-native';
import { Colors, Typography as Typo, Spacing, Radius, Shadows } from '@/styles/design-tokens';

// ═══════════════════════════════════════════
//  Base Card
// ═══════════════════════════════════════════

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  style,
  elevated = false,
  accessibilityLabel,
  accessibilityHint,
}) => (
  <View
    style={[styles.card, elevated && Shadows.elevated, style]}
    accessibilityRole="summary"
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
  >
    {children}
  </View>
);

// ═══════════════════════════════════════════
//  Now Playing Card
// ═══════════════════════════════════════════

interface NowPlayingCardProps {
  title: string;
  subtitle?: string;
  thumbnailUri?: string;
  isPlaying?: boolean;
  progress?: number; // 0-1
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const NowPlayingCard: React.FC<NowPlayingCardProps> = ({
  title,
  subtitle,
  thumbnailUri,
  isPlaying = false,
  progress = 0,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => (
  <View
    style={[styles.card, styles.nowPlaying, style]}
    accessibilityRole="summary"
    accessibilityLabel={accessibilityLabel || `Now playing: ${title}`}
    accessibilityHint={accessibilityHint || 'Tap to open player'}
    accessibilityState={{ expanded: false }}
  >
    {thumbnailUri ? (
      <Image
        source={{ uri: thumbnailUri }}
        style={styles.nowPlayingThumb}
        accessibilityIgnoresInvertColors
      />
    ) : (
      <View style={[styles.nowPlayingThumb, styles.thumbPlaceholder]} />
    )}
    <View style={styles.nowPlayingMeta}>
      <Text
        style={[styles.nowPlayingTitle, isPlaying && styles.nowPlayingTitleActive]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.nowPlayingSub} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
    {/* Progress bar */}
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
    </View>
  </View>
);

// ═══════════════════════════════════════════
//  Frequency Card
// ═══════════════════════════════════════════

interface FrequencyCardProps {
  frequency: number;
  unit?: string;
  label: string;
  description?: string;
  color?: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const FrequencyCard: React.FC<FrequencyCardProps> = ({
  frequency,
  unit = 'Hz',
  label,
  description,
  color = Colors.primary,
  style,
  accessibilityLabel,
  accessibilityHint,
}) => (
  <View
    style={[styles.card, styles.freqCard, style]}
    accessibilityRole="summary"
    accessibilityLabel={accessibilityLabel || `${label}: ${frequency} ${unit}`}
    accessibilityHint={accessibilityHint}
  >
    <View style={styles.freqHeader}>
      <Text style={[styles.freqValue, { color }]} maxFontSizeMultiplier={1.2}>
        {frequency.toFixed(frequency % 1 === 0 ? 0 : 2)}
      </Text>
      <Text style={[styles.freqUnit, { color }]} maxFontSizeMultiplier={1.2}>
        {unit}
      </Text>
    </View>
    <Text style={styles.freqLabel} numberOfLines={1} maxFontSizeMultiplier={1.3}>
      {label}
    </Text>
    {description ? (
      <Text style={styles.freqDesc} numberOfLines={2} maxFontSizeMultiplier={1.2}>
        {description}
      </Text>
    ) : null}
    {/* Accent dot */}
    <View style={[styles.freqDot, { backgroundColor: color }]} />
  </View>
);

// ═══════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════

const styles = StyleSheet.create({
  // Base card
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadows.card,
  },

  // NowPlaying
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  nowPlayingThumb: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
  },
  thumbPlaceholder: {
    backgroundColor: Colors.surface,
  },
  nowPlayingMeta: {
    flex: 1,
    gap: 2,
  },
  nowPlayingTitle: {
    fontFamily: Typo.title3.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  nowPlayingTitleActive: {
    color: Colors.primary,
  },
  nowPlayingSub: {
    fontFamily: Typo.caption.fontFamily,
    fontSize: Typo.caption.fontSize,
    color: Colors.textTertiary,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.surface,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },

  // FrequencyCard
  freqCard: {
    alignItems: 'center',
    padding: Spacing.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  freqHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  freqValue: {
    fontFamily: Typo.display.fontFamily,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  freqUnit: {
    fontFamily: Typo.body.fontFamily,
    fontSize: 16,
    fontWeight: '500',
    opacity: 0.6,
  },
  freqLabel: {
    fontFamily: Typo.title3.fontFamily,
    fontSize: Typo.title3.fontSize,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xxs,
  },
  freqDesc: {
    fontFamily: Typo.caption.fontFamily,
    fontSize: Typo.caption.fontSize,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  freqDot: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.6,
  },
});

export default Card;
