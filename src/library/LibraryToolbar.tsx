import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { LibraryViewMode } from '../settings/libraryViewMode';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// 터치 영역: 시각 크기 44 + hitSlop 2×2 = 48dp.
const BUTTON_SIZE = 44;
const BUTTON_HIT_SLOP = 2;

export const VIEW_MODE_GLYPH: Record<LibraryViewMode, string> = {
  grid: '▦',
  list: '☰',
  date: '◷',
};

interface LibraryToolbarProps {
  /** testID 접두사('album' | 'gallery') — `${prefix}-search-toggle` 같은 ID가 붙는다. */
  testIDPrefix: string;
  /** 왼쪽에 표시할 개수 요약("앨범 42개", "사진 128 · 영상 4"). */
  summary: string;
  searchPlaceholder: string;
  searchActive: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onSearchOpen: () => void;
  /** 검색을 닫는다. 호출하는 쪽은 검색어도 함께 비워야 한다(숨은 필터가 남지 않게). */
  onSearchClose: () => void;
  viewMode: LibraryViewMode;
  onViewModeCycle: () => void;
  onSortPress: () => void;
}

/**
 * 앨범 목록·앨범 갤러리가 공유하는 도구 줄. 스크롤되는 목록 바깥(헤더 바로 아래)에 두어 항상 보인다.
 * 평소엔 [개수 요약 … 🔍 보기 정렬], 검색을 켜면 줄 전체가 입력창으로 바뀐다.
 */
export function LibraryToolbar({
  testIDPrefix: p,
  summary,
  searchPlaceholder,
  searchActive,
  query,
  onQueryChange,
  onSearchOpen,
  onSearchClose,
  viewMode,
  onViewModeCycle,
  onSortPress,
}: LibraryToolbarProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(c), [c]);
  const viewModeName = t(`viewMode.${viewMode}`);

  if (searchActive) {
    return (
      <View style={styles.bar}>
        <Text style={styles.searchGlyph}>🔍</Text>
        <TextInput
          testID={`${p}-search-input`}
          style={styles.searchInput}
          value={query}
          onChangeText={onQueryChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={c.textSecondary}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <Pressable
          testID={`${p}-search-close`}
          accessibilityRole="button"
          accessibilityLabel={t('toolbar.searchClose')}
          hitSlop={BUTTON_HIT_SLOP}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          onPress={onSearchClose}
        >
          <Text style={styles.iconGlyph}>✕</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <Text testID={`${p}-summary`} style={styles.summary} numberOfLines={1}>
        {summary}
      </Text>
      <Pressable
        testID={`${p}-search-toggle`}
        accessibilityRole="button"
        accessibilityLabel={t('toolbar.search')}
        hitSlop={BUTTON_HIT_SLOP}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        onPress={onSearchOpen}
      >
        <Text style={styles.iconGlyph}>🔍</Text>
      </Pressable>
      <Pressable
        testID={`${p}-view-mode-toggle`}
        accessibilityRole="button"
        accessibilityLabel={`${t('toolbar.viewMode')}: ${viewModeName}`}
        hitSlop={BUTTON_HIT_SLOP}
        style={({ pressed }) => [styles.viewButton, pressed && styles.pressed]}
        onPress={onViewModeCycle}
      >
        <Text style={styles.iconGlyph}>{VIEW_MODE_GLYPH[viewMode]}</Text>
        <Text testID={`${p}-view-mode-label`} style={styles.viewLabel}>
          {viewModeName}
        </Text>
      </Pressable>
      <Pressable
        testID={`${p}-sort-button`}
        accessibilityRole="button"
        accessibilityLabel={t('toolbar.sort')}
        hitSlop={BUTTON_HIT_SLOP}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        onPress={onSortPress}
      >
        <Text style={styles.iconGlyph}>⇅</Text>
      </Pressable>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 52,
      paddingLeft: 16,
      paddingRight: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
      backgroundColor: c.background,
    },
    summary: {
      flex: 1,
      fontSize: 13,
      color: c.textSecondary,
    },
    iconButton: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewButton: {
      minWidth: BUTTON_SIZE,
      height: BUTTON_SIZE,
      paddingHorizontal: 10,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    pressed: {
      backgroundColor: c.hairline,
    },
    iconGlyph: {
      fontSize: 18,
      color: c.ink,
    },
    viewLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: c.ink,
    },
    searchGlyph: {
      fontSize: 16,
      color: c.textSecondary,
    },
    searchInput: {
      flex: 1,
      height: BUTTON_SIZE,
      fontSize: 15,
      color: c.ink,
    },
  });
}
