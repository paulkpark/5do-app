/**
 * 5DO HomeScreen
 * - Greeting + notification bell
 * - Now Playing card (or first-session CTA)
 * - 2x2 Quick Actions grid
 * - Recent Sessions list
 * - TabBar at bottom
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  AccessibilityInfo,
  useWindowDimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors, Spacing, Radius, Shadows, Sizes,
  Typography as Typo, FontFamily, Animation, ZIndex,
} from '@/styles/design-tokens';
import { Button } from '@/components/ui/Button';
import { Card, NowPlayingCard } from '@/components/ui/Card';
import { Title1, Title2, Title3, Body, Caption, Overline } from '@/components/ui/Typography';
import { TabBar } from '@/components/ui/TabBar';

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════

interface NowPlayingState {
  title: string;
  subtitle: string;
  thumbnailUri?: string;
  frequency: number;
  progress: number; // 0-1
  isPlaying: boolean;
}

interface QuickAction {
  key: string;
  label: string;
  labelEn: string;
  icon: string;
  gradient: readonly [string, string];
  accessibilityHint: string;
}

interface RecentSession {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  thumbnailUri?: string;
}

// ═══════════════════════════════════════════
//  Quick Actions Data
// ═══════════════════════════════════════════

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: 'akashic',
    label: '아카식 주파수',
    labelEn: 'Akashic Frequency',
    icon: '✦',
    gradient: Colors.gradientPrimary,
    accessibilityHint: 'AI 기반 맞춤형 주파수 분석을 시작합니다',
  },
  {
    key: 'sleep',
    label: '수면 치유',
    labelEn: 'Sleep Healing',
    icon: '🌙',
    gradient: ['#1E3A5F', '#0D1B2A'] as const,
    accessibilityHint: '수면 유도 힐링 트랙을 재생합니다',
  },
  {
    key: 'pemf',
    label: 'PEMF 테라피',
    labelEn: 'PEMF Therapy',
    icon: '⚡',
    gradient: ['#2D1B69', '#1A0A3E'] as const,
    accessibilityHint: 'PEMF 주파수 치료를 시작합니다',
  },
  {
    key: 'chroma',
    label: '컬러 테라피',
    labelEn: 'Visual Chroma',
    icon: '🎨',
    gradient: ['#4A1942', '#2D1225'] as const,
    accessibilityHint: '컬러 테라피 비주얼을 시작합니다',
  },
];

// ═══════════════════════════════════════════
//  Waveform Visualization (Now Playing)
// ═══════════════════════════════════════════

const WaveformBars: React.FC<{ isPlaying: boolean; barCount?: number }> = ({
  isPlaying,
  barCount = 32,
}) => {
  const [reduceMotion, setReduceMotion] = useState(false);
  const animValues = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!isPlaying || reduceMotion) {
      animValues.forEach((v) => v.setValue(0.3));
      return;
    }

    const animations = animValues.map((v, i) => {
      const phase = (i / barCount) * Math.PI * 2;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 0.3 + Math.sin(phase) * 0.4 + 0.3,
            duration: 600 + Math.random() * 400,
            useNativeDriver: false,
          }),
          Animated.timing(v, {
            toValue: 0.2 + Math.random() * 0.2,
            duration: 400 + Math.random() * 300,
            useNativeDriver: false,
          }),
        ])
      );
    });

    Animated.stagger(30, animations).start();

    return () => animations.forEach((a) => a.stop());
  }, [isPlaying, reduceMotion]);

  return (
    <View
      style={waveStyles.container}
      accessibilityLabel={isPlaying ? '재생 중 파형 시각화' : '일시정지됨'}
    >
      {animValues.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            {
              height: v.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 28],
              }),
              backgroundColor: Colors.primary,
              opacity: v.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.9],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
};

const waveStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: 2,
    marginVertical: Spacing.xs,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
});

// ═══════════════════════════════════════════
//  Greeting Helper
// ═══════════════════════════════════════════

function getGreeting(lang: 'ko' | 'en', name?: string): string {
  const hour = new Date().getHours();
  const greetings = {
    ko: hour < 12 ? '좋은 아침이에요' : hour < 18 ? '좋은 오후예요' : '좋은 저녁이에요',
    en: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
  };
  return name ? `${greetings[lang]}, ${name}` : greetings[lang];
}

// ═══════════════════════════════════════════
//  HomeScreen Component
// ═══════════════════════════════════════════

interface HomeScreenProps {
  lang?: 'ko' | 'en';
  userName?: string;
  nowPlaying?: NowPlayingState | null;
  recentSessions?: RecentSession[];
  onTabPress?: (key: string) => void;
  onQuickAction?: (key: string) => void;
  onNowPlayingPress?: () => void;
  onStartFirstSession?: () => void;
  onNotificationPress?: () => void;
  onRecentSessionPress?: (id: string) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  lang = 'ko',
  userName,
  nowPlaying = null,
  recentSessions = [],
  onTabPress,
  onQuickAction,
  onNowPlayingPress,
  onStartFirstSession,
  onNotificationPress,
  onRecentSessionPress,
}) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('home');

  const handleTabPress = (key: string) => {
    setActiveTab(key);
    onTabPress?.(key);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Greeting + Bell ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Title1
              accessibilityLabel={getGreeting(lang, userName)}
              accessibilityRole="header"
            >
              {getGreeting(lang, userName)}
            </Title1>
            <Caption color={Colors.textTertiary}>
              {lang === 'ko' ? '오늘의 치유 주파수를 찾아보세요' : 'Find your healing frequency today'}
            </Caption>
          </View>
          <TouchableOpacity
            style={styles.bellButton}
            onPress={onNotificationPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={lang === 'ko' ? '알림' : 'Notifications'}
            accessibilityHint={lang === 'ko' ? '알림 목록을 엽니다' : 'Opens notification list'}
          >
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* ── Now Playing / First Session CTA ── */}
        <View style={styles.section}>
          {nowPlaying ? (
            <TouchableOpacity
              onPress={onNowPlayingPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${lang === 'ko' ? '재생 중' : 'Now playing'}: ${nowPlaying.title}`}
              accessibilityHint={lang === 'ko' ? '플레이어를 엽니다' : 'Opens the player'}
            >
              <Card elevated style={styles.nowPlayingCard}>
                <Overline color={Colors.secondary}>
                  {lang === 'ko' ? '지금 재생 중' : 'NOW PLAYING'}
                </Overline>
                <View style={styles.nowPlayingRow}>
                  {nowPlaying.thumbnailUri ? (
                    <Image
                      source={{ uri: nowPlaying.thumbnailUri }}
                      style={styles.nowPlayingThumb}
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View style={[styles.nowPlayingThumb, { backgroundColor: Colors.surface }]} />
                  )}
                  <View style={styles.nowPlayingMeta}>
                    <Title3 numberOfLines={1}>{nowPlaying.title}</Title3>
                    <Caption numberOfLines={1}>{nowPlaying.subtitle}</Caption>
                  </View>
                  {/* Mini play/pause */}
                  <View style={styles.miniControl}>
                    <Text style={{ fontSize: 22 }}>
                      {nowPlaying.isPlaying ? '⏸' : '▶️'}
                    </Text>
                  </View>
                </View>
                <WaveformBars isPlaying={nowPlaying.isPlaying} />
                {/* Progress */}
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${nowPlaying.progress * 100}%` }]}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          ) : (
            /* First session CTA */
            <Card elevated style={styles.ctaCard}>
              <LinearGradient
                colors={['rgba(124,92,252,0.15)', 'rgba(62,207,207,0.08)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaEmoji}>🎵</Text>
                <Title2 align="center">
                  {lang === 'ko' ? '첫 번째 세션을 시작하세요' : 'Start Your First Session'}
                </Title2>
                <Body align="center" color={Colors.textSecondary} style={{ marginTop: Spacing.xs }}>
                  {lang === 'ko'
                    ? '150개 이상의 치유 주파수가 기다리고 있어요'
                    : '150+ healing frequencies are waiting for you'}
                </Body>
                <Button
                  title={lang === 'ko' ? '시작하기' : 'Get Started'}
                  variant="primary"
                  size="lg"
                  onPress={onStartFirstSession}
                  fullWidth
                  accessibilityHint={lang === 'ko' ? '라이브러리로 이동합니다' : 'Navigates to library'}
                  style={{ marginTop: Spacing.md }}
                />
              </LinearGradient>
            </Card>
          )}
        </View>

        {/* ── Quick Actions 2x2 ── */}
        <View style={styles.section}>
          <Overline style={{ marginBottom: Spacing.sm }}>
            {lang === 'ko' ? '빠른 실행' : 'QUICK ACTIONS'}
          </Overline>
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.key}
                onPress={() => onQuickAction?.(action.key)}
                activeOpacity={0.8}
                style={styles.quickItem}
                accessibilityRole="button"
                accessibilityLabel={lang === 'en' ? action.labelEn : action.label}
                accessibilityHint={action.accessibilityHint}
              >
                <LinearGradient
                  colors={action.gradient as unknown as string[]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickGradient}
                >
                  <Text style={styles.quickIcon}>{action.icon}</Text>
                  <Text style={styles.quickLabel} maxFontSizeMultiplier={1.2}>
                    {lang === 'en' ? action.labelEn : action.label}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Recent Sessions ── */}
        {recentSessions.length > 0 && (
          <View style={styles.section}>
            <Overline style={{ marginBottom: Spacing.sm }}>
              {lang === 'ko' ? '최근 세션' : 'RECENT SESSIONS'}
            </Overline>
            {recentSessions.map((session) => (
              <TouchableOpacity
                key={session.id}
                onPress={() => onRecentSessionPress?.(session.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={session.title}
                accessibilityHint={lang === 'ko' ? '이 세션을 다시 재생합니다' : 'Replays this session'}
              >
                <Card style={styles.sessionCard}>
                  <View style={styles.sessionRow}>
                    {session.thumbnailUri ? (
                      <Image
                        source={{ uri: session.thumbnailUri }}
                        style={styles.sessionThumb}
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={[styles.sessionThumb, { backgroundColor: Colors.surface }]} />
                    )}
                    <View style={styles.sessionMeta}>
                      <Body numberOfLines={1} style={{ fontWeight: '600' }}>
                        {session.title}
                      </Body>
                      <Caption numberOfLines={1}>{session.subtitle}</Caption>
                    </View>
                    <Caption color={Colors.textTertiary}>{session.date}</Caption>
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Bottom spacer for TabBar */}
        <View style={{ height: Sizes.tabBarHeight + Spacing.xl }} />
      </ScrollView>

      {/* ── Tab Bar ── */}
      <TabBar
        activeTab={activeTab}
        onTabPress={handleTabPress}
        lang={lang}
      />
    </View>
  );
};

// ═══════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerLeft: {
    flex: 1,
    gap: Spacing.xxs,
  },
  bellButton: {
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
    borderRadius: Sizes.touchTarget / 2,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 18,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },

  // Now Playing
  nowPlayingCard: {
    padding: Spacing.md,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  nowPlayingThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.sm,
  },
  nowPlayingMeta: {
    flex: 1,
    gap: 2,
  },
  miniControl: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.surface,
    borderRadius: 1.5,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 1.5,
  },

  // First session CTA
  ctaCard: {
    padding: 0,
    overflow: 'hidden',
  },
  ctaGradient: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  ctaEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },

  // Quick Actions
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  quickItem: {
    width: '48.5%',
    aspectRatio: 1.6,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  quickGradient: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'flex-end',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickIcon: {
    fontSize: 28,
    marginBottom: Spacing.xs,
  },
  quickLabel: {
    fontFamily: FontFamily.display,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },

  // Recent Sessions
  sessionCard: {
    marginBottom: Spacing.xs,
    padding: Spacing.sm,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sessionThumb: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
  },
  sessionMeta: {
    flex: 1,
    gap: 2,
  },
});

export default HomeScreen;
