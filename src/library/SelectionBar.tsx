import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

interface SelectionBarProps {
  count: number;
  /** 작업이 진행 중이면 모든 버튼을 막는다(시스템 다이얼로그가 떠 있는 동안 중복 실행 방지). */
  busy: boolean;
  onCancel: () => void;
  onSelectAll: () => void;
  /** 이동·복사·삭제 — 파일 관리를 지원하지 않는 환경(앨범 목록)에서는 넘기지 않는다. 없으면 버튼이 없다. */
  onMove?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  /** 이름 변경 — 앨범 선택 모드에서 앨범이 정확히 1개 선택됐을 때만 넘긴다. 없으면 버튼이 없다. */
  onRename?: () => void;
  /** 즐겨찾기 추가/해제(앨범 목록 전용). 선택한 앨범이 모두 즐겨찾기면 해제, 아니면 추가 버튼이 된다. */
  /** 아랫줄은 파일 작업 버튼으로 차 있어(360dp 기준) 윗줄의 "전체 선택" 앞에 둔다. */
  favorite?: { allFavorites: boolean; disabled: boolean; onPress: () => void };
}

/**
 * 선택 모드 상단 바(툴바 자리를 대신한다). 윗줄: 해제 · 선택 개수 (· 즐겨찾기) · 전체 선택, 아랫줄: 이동 · 복사 · 삭제 (· 이름 변경).
 * 갤러리(사진·영상 선택)와 앨범 목록(앨범 선택)이 함께 쓴다.
 */
export function SelectionBar({
  count,
  busy,
  onCancel,
  onSelectAll,
  onMove,
  onCopy,
  onDelete,
  onRename,
  favorite,
}: SelectionBarProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const actionsDisabled = busy || count === 0;

  const action = (testID: string, label: string, onPress: () => void, disabled: boolean) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      style={styles.textButton}
      onPress={onPress}
    >
      <Text style={[styles.actionText, disabled && styles.disabledText]}>{label}</Text>
    </Pressable>
  );

  return (
    <View testID="selection-bar" style={styles.bar}>
      <View style={styles.row}>
        <Pressable
          testID="selection-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('selectionCancel')}
          disabled={busy}
          hitSlop={8}
          style={styles.iconButton}
          onPress={onCancel}
        >
          <Text style={styles.iconText}>✕</Text>
        </Pressable>
        <Text testID="selection-count" style={styles.count} numberOfLines={1}>
          {t('selectionCount', { count })}
        </Text>
        {favorite
          ? action(
              'selection-favorite',
              t(favorite.allFavorites ? 'favoriteRemoveAction' : 'favoriteAddAction'),
              favorite.onPress,
              actionsDisabled || favorite.disabled
            )
          : null}
        <Pressable
          testID="selection-select-all"
          accessibilityRole="button"
          disabled={busy}
          hitSlop={8}
          style={styles.textButton}
          onPress={onSelectAll}
        >
          <Text style={[styles.actionText, busy && styles.disabledText]}>{t('selectAll')}</Text>
        </Pressable>
      </View>
      {/* 파일 작업을 지원하지 않는 환경(앨범 목록, Android 10 이하)에서는 빈 줄을 남기지 않는다. */}
      {onMove || onCopy || onDelete || onRename ? (
        <View style={styles.row}>
          {onMove ? action('selection-move', t('moveAction'), onMove, actionsDisabled) : null}
          {onCopy ? action('selection-copy', t('copyAction'), onCopy, actionsDisabled) : null}
          {onDelete ? action('selection-delete', t('deleteAction'), onDelete, actionsDisabled) : null}
          {onRename ? action('selection-rename', t('renameAction'), onRename, actionsDisabled) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    bar: {
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
      backgroundColor: c.background,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      gap: 4,
    },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconText: {
      fontSize: 18,
      color: c.ink,
    },
    count: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: c.ink,
    },
    textButton: {
      minHeight: 40,
      paddingHorizontal: 12,
      justifyContent: 'center',
    },
    actionText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.accent,
    },
    disabledText: {
      opacity: 0.4,
    },
  });
}
