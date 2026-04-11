/**
 * 5DO AkashicFrequencyScreen
 * AI personalization module:
 * - Birth date, symptoms/goals, emotional state input
 * - KO/EN toggle
 * - "Generate My Frequency" CTA
 * - Result: recommended frequency + description card, "Begin Session" button
 * - Saju (Four Pillars) placeholder section
 */
import React, { useState } from 'react';
import {
  View, ScrollView, TextInput, StyleSheet,
  TouchableOpacity, Text, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Colors, Spacing, Radius, Shadows, Sizes,
  Typography as Typo, FontFamily,
} from '@/styles/design-tokens';
import { Button } from '@/components/ui/Button';
import { Card, FrequencyCard } from '@/components/ui/Card';
import { Display, Title1, Title2, Title3, Body, Caption, Overline } from '@/components/ui/Typography';

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════

interface AnalysisResult {
  personalFrequency: number;
  schumannResonance: number;
  chakras: Array<{ name: string; hz: number; color: string }>;
  pemfRange: { name: string; min: number; max: number };
  description: string;
  archetype?: string;
}

interface AkashicFrequencyScreenProps {
  lang?: 'ko' | 'en';
  onBack?: () => void;
  onBeginSession?: (result: AnalysisResult) => void;
}

// ═══════════════════════════════════════════
//  Input Field Component
// ═══════════════════════════════════════════

const InputField: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  multiline?: boolean;
  accessibilityHint?: string;
}> = ({ label, placeholder, value, onChangeText, multiline, accessibilityHint }) => (
  <View style={inputStyles.field}>
    <Caption color={Colors.textSecondary} style={inputStyles.label}>{label}</Caption>
    <TextInput
      style={[inputStyles.input, multiline && inputStyles.multiline]}
      placeholder={placeholder}
      placeholderTextColor={Colors.textTertiary}
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      maxFontSizeMultiplier={1.3}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    />
  </View>
);

const inputStyles = StyleSheet.create({
  field: { marginBottom: Spacing.md },
  label: { marginBottom: Spacing.xxs, fontWeight: '600' },
  input: {
    height: Sizes.inputHeight,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    fontFamily: FontFamily.text,
    fontSize: 15,
  },
  multiline: {
    height: 100,
    paddingTop: Spacing.sm,
    textAlignVertical: 'top',
  },
});

// ═══════════════════════════════════════════
//  Date Picker Row
// ═══════════════════════════════════════════

const DateRow: React.FC<{
  year: string; month: string; day: string;
  onYear: (v: string) => void; onMonth: (v: string) => void; onDay: (v: string) => void;
  lang: 'ko' | 'en';
}> = ({ year, month, day, onYear, onMonth, onDay, lang }) => (
  <View style={dateStyles.row}>
    <View style={dateStyles.col}>
      <Caption color={Colors.textSecondary} style={{ fontWeight: '600', marginBottom: Spacing.xxs }}>
        {lang === 'ko' ? '연도' : 'Year'}
      </Caption>
      <TextInput
        style={dateStyles.input}
        placeholder="1990"
        placeholderTextColor={Colors.textTertiary}
        keyboardType="number-pad"
        maxLength={4}
        value={year}
        onChangeText={onYear}
        accessibilityLabel={lang === 'ko' ? '출생 연도' : 'Birth year'}
      />
    </View>
    <View style={dateStyles.col}>
      <Caption color={Colors.textSecondary} style={{ fontWeight: '600', marginBottom: Spacing.xxs }}>
        {lang === 'ko' ? '월' : 'Month'}
      </Caption>
      <TextInput
        style={dateStyles.input}
        placeholder="6"
        placeholderTextColor={Colors.textTertiary}
        keyboardType="number-pad"
        maxLength={2}
        value={month}
        onChangeText={onMonth}
        accessibilityLabel={lang === 'ko' ? '출생 월' : 'Birth month'}
      />
    </View>
    <View style={dateStyles.col}>
      <Caption color={Colors.textSecondary} style={{ fontWeight: '600', marginBottom: Spacing.xxs }}>
        {lang === 'ko' ? '일' : 'Day'}
      </Caption>
      <TextInput
        style={dateStyles.input}
        placeholder="15"
        placeholderTextColor={Colors.textTertiary}
        keyboardType="number-pad"
        maxLength={2}
        value={day}
        onChangeText={onDay}
        accessibilityLabel={lang === 'ko' ? '출생 일' : 'Birth day'}
      />
    </View>
  </View>
);

const dateStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  col: { flex: 1 },
  input: {
    height: Sizes.inputHeight,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    color: Colors.textPrimary,
    fontFamily: FontFamily.text,
    fontSize: 15,
    textAlign: 'center',
  },
});

// ═══════════════════════════════════════════
//  AkashicFrequencyScreen
// ═══════════════════════════════════════════

export const AkashicFrequencyScreen: React.FC<AkashicFrequencyScreenProps> = ({
  lang = 'ko',
  onBack,
  onBeginSession,
}) => {
  const insets = useSafeAreaInsets();

  // Form state
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [goals, setGoals] = useState('');
  const [emotion, setEmotion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canSubmit = year.length === 4 && month && day;

  const handleGenerate = async () => {
    if (!canSubmit) return;
    setLoading(true);
    // TODO: API call to /api/analyze
    // Simulate for now
    setTimeout(() => {
      setResult({
        personalFrequency: 463.17,
        schumannResonance: 7.83,
        chakras: [
          { name: lang === 'ko' ? '태양신경총' : 'Solar Plexus', hz: 528, color: '#FFD700' },
          { name: lang === 'ko' ? '뿌리 차크라' : 'Root Chakra', hz: 396, color: '#FF4444' },
          { name: lang === 'ko' ? '목 차크라' : 'Throat Chakra', hz: 741, color: '#4488FF' },
        ],
        pemfRange: { name: lang === 'ko' ? '베타' : 'Beta', min: 13, max: 30 },
        description: lang === 'ko'
          ? '당신의 영혼 원형은 변환자(Transformer)입니다. 528Hz DNA 복구 주파수와 396Hz 뿌리 차크라 활성화가 최적의 조합입니다.'
          : 'Your soul archetype is the Transformer. 528Hz DNA repair frequency combined with 396Hz root chakra activation is your optimal combination.',
        archetype: lang === 'ko' ? '변환자 (Transformer)' : 'Transformer',
      });
      setLoading(false);
    }, 2000);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={lang === 'ko' ? '뒤로' : 'Back'}
        >
          <Text style={{ fontSize: 22, color: Colors.textSecondary }}>‹</Text>
        </TouchableOpacity>
        <Title3>{lang === 'ko' ? '아카식 주파수' : 'Akashic Frequency'}</Title3>
        <View style={{ width: Sizes.touchTarget }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!result ? (
          <>
            {/* Intro */}
            <View style={styles.intro}>
              <Text style={styles.introEmoji}>✦</Text>
              <Title2 align="center">
                {lang === 'ko' ? '당신만의 공명 주파수' : 'Your Resonance Frequency'}
              </Title2>
              <Body align="center" color={Colors.textSecondary} style={{ marginTop: Spacing.xs }}>
                {lang === 'ko'
                  ? '출생 정보를 입력하면 AI가 최적의 치유 주파수를 분석합니다.'
                  : 'Enter your birth data and AI will analyze your optimal healing frequency.'}
              </Body>
            </View>

            {/* Form */}
            <Card style={styles.formCard}>
              <Overline style={{ marginBottom: Spacing.md }}>
                {lang === 'ko' ? '출생 정보' : 'BIRTH DATA'}
              </Overline>

              <DateRow
                year={year} month={month} day={day}
                onYear={setYear} onMonth={setMonth} onDay={setDay}
                lang={lang}
              />

              <InputField
                label={lang === 'ko' ? '현재 증상 / 목표' : 'Current Symptoms / Goals'}
                placeholder={lang === 'ko' ? '예: 수면 개선, 스트레스 해소...' : 'e.g., Better sleep, stress relief...'}
                value={goals}
                onChangeText={setGoals}
                multiline
                accessibilityHint={lang === 'ko' ? '치유 목표를 입력하세요' : 'Enter your healing goals'}
              />

              <InputField
                label={lang === 'ko' ? '현재 감정 상태' : 'Current Emotional State'}
                placeholder={lang === 'ko' ? '예: 불안, 피로, 평온...' : 'e.g., Anxious, tired, calm...'}
                value={emotion}
                onChangeText={setEmotion}
                accessibilityHint={lang === 'ko' ? '현재 감정을 입력하세요' : 'Enter your current emotion'}
              />
            </Card>

            {/* Generate CTA */}
            <Button
              title={loading
                ? (lang === 'ko' ? '분석 중...' : 'Analyzing...')
                : (lang === 'ko' ? '내 주파수 생성하기' : 'Generate My Frequency')}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!canSubmit || loading}
              onPress={handleGenerate}
              accessibilityHint={lang === 'ko' ? 'AI가 맞춤형 주파수를 분석합니다' : 'AI analyzes your personalized frequency'}
            />

            {/* Saju placeholder */}
            <Card style={styles.sajuPlaceholder}>
              <View style={styles.sajuInner}>
                <Overline color={Colors.textTertiary}>
                  {lang === 'ko' ? '사주명리 분석' : 'FOUR PILLARS ANALYSIS'}
                </Overline>
                <Caption color={Colors.textTertiary} align="center" style={{ marginTop: Spacing.xs }}>
                  {lang === 'ko'
                    ? '출생 정보 입력 후 자동으로 분석됩니다'
                    : 'Automatically analyzed after entering birth data'}
                </Caption>
              </View>
            </Card>
          </>
        ) : (
          /* ═══ Result View ═══ */
          <>
            <View style={styles.intro}>
              <Text style={styles.introEmoji}>✦</Text>
              <Overline color={Colors.secondary} style={{ marginBottom: Spacing.xxs }}>
                {lang === 'ko' ? '영혼 원형' : 'SOUL ARCHETYPE'}
              </Overline>
              <Title1 align="center">{result.archetype}</Title1>
            </View>

            {/* Frequency Cards */}
            <View style={styles.freqRow}>
              <FrequencyCard
                frequency={result.personalFrequency}
                label={lang === 'ko' ? '개인 공명' : 'Personal'}
                color={Colors.primary}
                style={{ flex: 1 }}
                accessibilityHint={lang === 'ko' ? '개인 공명 주파수' : 'Personal resonance frequency'}
              />
              <FrequencyCard
                frequency={result.schumannResonance}
                label={lang === 'ko' ? '슈만 공명' : 'Schumann'}
                color={Colors.secondary}
                style={{ flex: 1 }}
                accessibilityHint={lang === 'ko' ? '슈만 공명 주파수' : 'Schumann resonance frequency'}
              />
            </View>

            {/* Chakras */}
            <Card style={{ marginBottom: Spacing.md }}>
              <Overline style={{ marginBottom: Spacing.sm }}>
                {lang === 'ko' ? '활성 차크라' : 'ACTIVE CHAKRAS'}
              </Overline>
              {result.chakras.map((c, i) => (
                <View key={i} style={styles.chakraRow}>
                  <View style={[styles.chakraDot, { backgroundColor: c.color }]} />
                  <Body style={{ flex: 1 }}>{c.name}</Body>
                  <Caption color={Colors.primary} style={{ fontWeight: '700' }}>
                    {c.hz}Hz
                  </Caption>
                </View>
              ))}
            </Card>

            {/* PEMF Range */}
            <Card style={{ marginBottom: Spacing.md }}>
              <Overline style={{ marginBottom: Spacing.xs }}>
                {lang === 'ko' ? 'PEMF 뇌파 대역' : 'PEMF BRAINWAVE BAND'}
              </Overline>
              <Title3 color={Colors.accentWarm}>
                {result.pemfRange.name} ({result.pemfRange.min}-{result.pemfRange.max}Hz)
              </Title3>
            </Card>

            {/* Description */}
            <Card style={{ marginBottom: Spacing.lg }}>
              <Body color={Colors.textSecondary} style={{ lineHeight: 24 }}>
                {result.description}
              </Body>
            </Card>

            {/* Begin Session */}
            <Button
              title={lang === 'ko' ? '세션 시작하기' : 'Begin Session'}
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => onBeginSession?.(result)}
              accessibilityHint={lang === 'ko' ? '추천 주파수로 세션을 시작합니다' : 'Starts a session with recommended frequency'}
            />

            {/* Re-analyze */}
            <Button
              title={lang === 'ko' ? '다시 분석하기' : 'Re-analyze'}
              variant="ghost"
              size="md"
              fullWidth
              onPress={() => setResult(null)}
              style={{ marginTop: Spacing.sm }}
            />
          </>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  backBtn: {
    width: Sizes.touchTarget,
    height: Sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.md },

  // Intro
  intro: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  introEmoji: {
    fontSize: 36,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },

  // Form
  formCard: {
    marginBottom: Spacing.lg,
  },

  // Saju placeholder
  sajuPlaceholder: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    borderStyle: 'dashed',
  },
  sajuInner: {
    alignItems: 'center',
    padding: Spacing.lg,
  },

  // Result
  freqRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chakraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  chakraDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

export default AkashicFrequencyScreen;
