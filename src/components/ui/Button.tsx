/**
 * 5DO Button Component
 * Variants: Primary, Secondary, Tertiary, Destructive, Ghost
 * Sizes: sm, md, lg
 */
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography as Typo, Spacing, Radius, Sizes, Animation } from '@/styles/design-tokens';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const sizeStyles: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  sm: {
    container: { height: 36, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm },
    text: { fontSize: 13, fontWeight: '600' },
  },
  md: {
    container: { height: Sizes.touchTarget, paddingHorizontal: Spacing.md, borderRadius: Radius.md },
    text: { fontSize: 15, fontWeight: '600' },
  },
  lg: {
    container: { height: 52, paddingHorizontal: Spacing.lg, borderRadius: Radius.lg },
    text: { fontSize: 17, fontWeight: '700' },
  },
};

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: TextStyle; useGradient?: boolean }> = {
  primary: {
    container: {},
    text: { color: '#FFFFFF' },
    useGradient: true,
  },
  secondary: {
    container: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    text: { color: Colors.textPrimary },
  },
  tertiary: {
    container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border },
    text: { color: Colors.textSecondary },
  },
  destructive: {
    container: { backgroundColor: Colors.error },
    text: { color: '#FFFFFF' },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: Colors.primary },
  },
};

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const sizeS = sizeStyles[size];
  const variantS = variantStyles[variant];
  const opacity = disabled ? 0.4 : 1;

  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantS.text.color as string}
          style={{ marginRight: title ? Spacing.xs : 0 }}
        />
      ) : icon && iconPosition === 'left' ? (
        <>{icon}</>
      ) : null}
      {title ? (
        <Text
          style={[
            styles.text,
            sizeS.text,
            variantS.text,
            icon ? { marginLeft: iconPosition === 'left' ? Spacing.xs : 0, marginRight: iconPosition === 'right' ? Spacing.xs : 0 } : null,
          ]}
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>
      ) : null}
      {icon && iconPosition === 'right' && !loading ? <>{icon}</> : null}
    </>
  );

  const containerStyle: ViewStyle[] = [
    styles.container,
    sizeS.container,
    variantS.container,
    fullWidth ? { width: '100%' } : {},
    { opacity },
  ];

  if (variant === 'primary' && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, busy: loading }}
      >
        <LinearGradient
          colors={Colors.gradientPrimary as unknown as string[]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={containerStyle}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={containerStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
    >
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: Typo.body.fontFamily,
    textAlign: 'center',
  },
});

export default Button;
