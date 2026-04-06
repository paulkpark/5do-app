/**
 * 5DO Tab Bar — iOS Tab Bar pattern
 * 5 tabs: Home, Explore, Akashic (center, emphasized), Library, Profile
 */
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius, Sizes, Shadows, FontFamily } from '@/styles/design-tokens';

// Tab icon placeholder — replace with Lucide or SF Symbols
const TabIcon: React.FC<{ name: string; focused: boolean; isCenter?: boolean }> = ({ name, focused, isCenter }) => {
  const icons: Record<string, string> = {
    home: '🏠', explore: '🔍', akashic: '✦', library: '🎵', profile: '👤',
  };
  return (
    <Text style={{
      fontSize: isCenter ? 22 : 20,
      opacity: focused ? 1 : 0.5,
    }}>
      {icons[name] || '●'}
    </Text>
  );
};

export interface TabItem {
  key: string;
  label: string;
  labelEn?: string;
  icon: string;
  accessibilityHint?: string;
}

const DEFAULT_TABS: TabItem[] = [
  { key: 'home',    label: '홈',       labelEn: 'Home',    icon: 'home',    accessibilityHint: '홈 화면으로 이동합니다' },
  { key: 'explore', label: '탐색',     labelEn: 'Explore', icon: 'explore', accessibilityHint: '카테고리를 탐색합니다' },
  { key: 'akashic', label: '아카식',   labelEn: 'Akashic', icon: 'akashic', accessibilityHint: '아카식 AI 분석을 시작합니다' },
  { key: 'library', label: '라이브러리', labelEn: 'Library', icon: 'library', accessibilityHint: '트랙 라이브러리를 엽니다' },
  { key: 'profile', label: '프로필',   labelEn: 'Profile', icon: 'profile', accessibilityHint: '프로필 설정을 엽니다' },
];

interface TabBarProps {
  activeTab: string;
  onTabPress: (key: string) => void;
  tabs?: TabItem[];
  lang?: 'ko' | 'en';
}

export const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onTabPress,
  tabs = DEFAULT_TABS,
  lang = 'ko',
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, Spacing.xs) }]}
      accessibilityRole="tablist"
      accessibilityLabel={lang === 'ko' ? '메인 탭 바' : 'Main tab bar'}
    >
      {tabs.map((tab) => {
        const isCenter = tab.key === 'akashic';
        const focused = activeTab === tab.key;
        const label = lang === 'en' && tab.labelEn ? tab.labelEn : tab.label;

        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
            style={[styles.tab, isCenter && styles.tabCenter]}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint={tab.accessibilityHint}
            accessibilityState={{ selected: focused }}
          >
            {isCenter ? (
              <View style={[styles.centerButton, focused && styles.centerButtonActive]}>
                <TabIcon name={tab.icon} focused={focused} isCenter />
              </View>
            ) : (
              <TabIcon name={tab.icon} focused={focused} />
            )}
            <Text
              style={[
                styles.label,
                focused && styles.labelFocused,
                isCenter && focused && styles.labelCenter,
              ]}
              maxFontSizeMultiplier={1.2}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.xs,
    ...Shadows.card,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: Sizes.tabBarHeight,
  },
  tabCenter: {
    marginTop: -12,
  },
  centerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: Colors.primary,
    ...Shadows.glow,
  },
  label: {
    fontFamily: FontFamily.text,
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textTertiary,
    marginTop: 2,
  },
  labelFocused: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  labelCenter: {
    color: Colors.primary,
  },
});

export default TabBar;
