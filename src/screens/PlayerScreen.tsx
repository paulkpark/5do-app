/**
 * 5DO PlayerScreen
 * - Frequency ring visualization (3 concentric rings, rotation, Hz center)
 * - Title + subtitle
 * - Scrubbable progress bar
 * - Play controls: timer / play-pause(56pt) / favorite
 * - Volume slider
 * - Pull-down gesture to minimize
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  PanResponder, AccessibilityInfo, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors, Spacing, Radius, Shadows, Sizes,
  Typography as Typo, FontFamily, Animation,
} from '@/styles/design-tokens';
import { Title2, Body, Caption, Overline } from '@/components/ui/Typography';

// ═══════════════════════════════════════════
//  Frequency Ring Visualization
// ═══════════════════════════════════════════

function getFreqColor(freq: number): string {
  if (freq <= 100) return Colors.secondary;
  if (freq <= 500) return Colors.primary;
  return '#FF6B9D';
}

const FrequencyRings: React.FC<{
  frequency: number;
  isPlaying: boolean;
  size: number;
}> = ({ frequency, isPlaying, size }) => {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!isPlaying || reduceMotion) {
      rotation.setValue(0);
      pulse.setValue(1);
      return;
    }

    const rotAnim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 12000,
        useNativeDriver: true,
      })
    );

    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 2000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.97, duration: 2000, useNativeDriver: true }),
      ])
    );

    rotAnim.start();
    pulseAnim.start();

    return () => { rotAnim.stop(); pulseAnim.stop(); };
  }, [isPlaying, reduceMotion]);

  const color = getFreqColor(frequency);
  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const spinReverse = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  const ringBase = {
    position: 'absolute' as const,
    borderRadius: 9999,
    borderWidth: 1.5,
  };

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityLabel={`주파수 ${frequency}Hz 시각화`}
    >
      {/* Outer ring */}
      <Animated.View style={[ringBase, {
        width: size, height: size,
        borderColor: color + '25',
        transform: [{ rotate: spin }, { scale: pulse }],
      }]} />
      {/* Middle ring */}
      <Animated.View style={[ringBase, {
        width: size * 0.75, height: size * 0.75,
        borderColor: color + '40',
        transform: [{ rotate: spinReverse }],
      }]} />
      {/* Inner ring */}
      <Animated.View style={[ringBase, {
        width: size * 0.5, height: size * 0.5,
        borderColor: color + '60',
        transform: [{ rotate: spin }],
      }]} />
      {/* Center glow */}
      <View style={[ringStyles.centerGlow, {
        width: size * 0.35, height: size * 0.35, borderRadius: size * 0.175,
        backgroundColor: color + '10',
      }]} />
      {/* Hz display */}
      <View style={ringStyles.hzContainer}>
        <Text style={[ringStyles.hzValue, { color }]} maxFontSizeMultiplier={1.15}>
          {frequency.toFixed(frequency % 1 === 0 ? 0 : 2)}
        </Text>
        <Text style={[ringStyles.hzUnit, { color: color + '80' }]} maxFontSizeMultiplier={1.15}>
          Hz
        </Text>
      </View>
    </View>
  );
};

const ringStyles = StyleSheet.create({
  centerGlow: { position: 'absolute' },
  hzContainer: { position: 'absolute', alignItems: 'center' },
  hzValue: {
    fontFamily: FontFamily.display,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  hzUnit: {
    fontFamily: FontFamily.text,
    fontSize: 16,
    fontWeight: '500',
    marginTop: -4,
  },
});

// ═══════════════════════════════════════════
//  Progress Bar (Scrubbable)
// ═══════════════════════════════════════════

const ProgressBar: React.FC<{
  progress: number;
  duration: number;
  currentTime: number;
  onSeek?: (position: number) => void;
}> = ({ progress, duration, currentTime, onSeek }) => {
  const barWidth = useRef(0);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        if (barWidth.current > 0) {
          const pos = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth.current));
          onSeek?.(pos);
        }
      },
      onPanResponderMove: (e) => {
        if (barWidth.current > 0) {
          const pos = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth.current));
          onSeek?.(pos);
        }
      },
    })
  ).current;

  return (
    <View style={progStyles.container}>
      <View
        style={progStyles.track}
        onLayout={(e) => { barWidth.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={`진행률 ${Math.round(progress * 100)}%`}
        accessibilityHint="좌우로 드래그하여 탐색합니다"
      >
        <View style={[progStyles.fill, { width: `${progress * 100}%` }]} />
        <View style={[progStyles.thumb, { left: `${progress * 100}%` }]} />
      </View>
      <View style={progStyles.times}>
        <Caption color={Colors.textTertiary}>{formatTime(currentTime)}</Caption>
        <Caption color={Colors.textTertiary}>{formatTime(duration)}</Caption>
      </View>
    </View>
  );
};

const progStyles = StyleSheet.create({
  container: { width: '100%', paddingHorizontal: Spacing.lg },
  track: {
    height: 28, justifyContent: 'center',
  },
  fill: {
    position: 'absolute', left: 0, top: 12, height: 4,
    backgroundColor: Colors.primary, borderRadius: 2,
  },
  thumb: {
    position: 'absolute', top: 7,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fff',
    marginLeft: -7,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 6,
  },
  times: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 2,
  },
});

// ═══════════════════════════════════════════
//  Volume Slider
// ═══════════════════════════════════════════

const VolumeSlider: React.FC<{ volume: number; onVolumeChange?: (v: number) => void }> = ({
  volume,
  onVolumeChange,
}) => (
  <View style={volStyles.container}>
    <Text style={volStyles.icon}>🔈</Text>
    <View style={volStyles.track}>
      <View style={[volStyles.fill, { width: `${volume * 100}%` }]} />
    </View>
    <Text style={volStyles.icon}>🔊</Text>
  </View>
);

const volStyles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.xl, marginTop: Spacing.lg,
  },
  icon: { fontSize: 14, opacity: 0.4 },
  track: {
    flex: 1, height: 4, backgroundColor: Colors.surface,
    borderRadius: 2, overflow: 'hidden',
  },
  fill: {
    height: '100%', backgroundColor: Colors.textTertiary, borderRadius: 2,
  },
});

// ═══════════════════════════════════════════
//  PlayerScreen Component
// ═══════════════════════════════════════════

interface PlayerScreenProps {
  title: string;
  subtitle?: string;
  frequency: number;
  isPlaying?: boolean;
  progress?: number;
  duration?: number;
  currentTime?: number;
  volume?: number;
  isFavorite?: boolean;
  source?: string;
  lang?: 'ko' | 'en';
  onClose?: () => void;
  onPlayPause?: () => void;
  onTimer?: () => void;
  onFavorite?: () => void;
  onSeek?: (pos: number) => void;
  onVolumeChange?: (v: number) => void;
  onSettings?: () => void;
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({
  title,
  subtitle,
  frequency = 432,
  isPlaying = false,
  progress = 0,
  duration = 0,
  currentTime = 0,
  volume = 0.7,
  isFavorite = false,
  source,
  lang = 'ko',
  onClose,
  onPlayPause,
  onTimer,
  onFavorite,
  onSeek,
  onVolumeChange,
  onSettings,
}) => {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const ringSize = Math.min(screenW * 0.7, 300);
  const translateY = useRef(new Animated.Value(0)).current;

  // Pull-down to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dx) < Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 120) {
          Animated.timing(translateY, { toValue: 600, duration: Animation.normal, useNativeDriver: true }).start(() => onClose?.());
        } else {
          Animated.spring(translateY, { toValue: 0, ...Animation.spring, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[styles.screen, { paddingTop: insets.top, transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={lang === 'ko' ? '최소화' : 'Minimize'}
          accessibilityHint={lang === 'ko' ? '미니 플레이어로 전환합니다' : 'Switches to mini player'}
        >
          <Text style={styles.chevron}>⌄</Text>
        </TouchableOpacity>
        <Overline color={Colors.textTertiary}>
          {source || (lang === 'ko' ? '라이브러리에서 재생' : 'PLAYING FROM LIBRARY')}
        </Overline>
        <TouchableOpacity
          onPress={onSettings}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel={lang === 'ko' ? '설정' : 'Settings'}
        >
          <Text style={{ fontSize: 18, color: Colors.textSecondary }}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Frequency Ring */}
      <View style={styles.ringArea}>
        <FrequencyRings frequency={frequency} isPlaying={isPlaying} size={ringSize} />
      </View>

      {/* Title */}
      <View style={styles.titleArea}>
        <Title2 align="center" numberOfLines={1}>{title}</Title2>
        {subtitle && (
          <Caption align="center" color={Colors.textSecondary} style={{ marginTop: Spacing.xxs }}>
            {subtitle}
          </Caption>
        )}
      </View>

      {/* Progress */}
      <ProgressBar
        progress={progress}
        duration={duration}
        currentTime={currentTime}
        onSeek={onSeek}
      />

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={onTimer}
          style={styles.sideBtn}
          accessibilityRole="button"
          accessibilityLabel={lang === 'ko' ? '타이머' : 'Timer'}
          accessibilityHint={lang === 'ko' ? '수면 타이머를 설정합니다' : 'Sets a sleep timer'}
        >
          <Text style={styles.sideBtnIcon}>⏱</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onPlayPause}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? (lang === 'ko' ? '일시정지' : 'Pause') : (lang === 'ko' ? '재생' : 'Play')}
        >
          <LinearGradient
            colors={Colors.gradientPrimary as unknown as string[]}
            style={styles.playBtn}
          >
            <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onFavorite}
          style={styles.sideBtn}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? (lang === 'ko' ? '즐겨찾기 해제' : 'Remove favorite') : (lang === 'ko' ? '즐겨찾기' : 'Add favorite')}
          accessibilityState={{ selected: isFavorite }}
        >
          <Text style={[styles.sideBtnIcon, isFavorite && { color: Colors.accentWarm }]}>
            {isFavorite ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Volume */}
      <VolumeSlider volume={volume} onVolumeChange={onVolumeChange} />
    </Animated.View>
  );
};

// ═══════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerBtn: {
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 28,
    color: Colors.textSecondary,
    fontWeight: '300',
    marginTop: -4,
  },
  ringArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  titleArea: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
    width: '100%',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
    marginTop: Spacing.md,
  },
  sideBtn: {
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnIcon: {
    fontSize: 24,
    color: Colors.textSecondary,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.glow,
  },
  playIcon: {
    fontSize: 22,
    color: '#fff',
    marginLeft: 2,
  },
});

export default PlayerScreen;
