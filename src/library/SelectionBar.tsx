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
  onMove: () => void;
  onDelete: () => void;
}

/** 갤러리 선택 모드 상단 바(툴바 자리를 대신한다): 해제 · 선택 개수 · 전체 선택 · 이동 · 삭제. */
export function SelectionBar({ count, busy, onCancel, onSelectAll, onMove, onDelete }: SelectionBarProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const actionsDisabled = busy || count === 0;

  return (
    <View testID="selection-bar" style={styles.bar}>
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
      <Pressable
        testID="selection-move"
        accessibilityRole="button"
        accessibilityState={{ disabled: actionsDisabled }}
        disabled={actionsDisabled}
        hitSlop={8}
        style={styles.textButton}
        onPress={onMove}
      >
        <Text style={[styles.actionText, actionsDisabled && styles.disabledText]}>{t('moveAction')}</Text>
      </Pressable>
      <Pressable
        testID="selection-delete"
        accessibilityRole="button"
        accessibilityState={{ disabled: actionsDisabled }}
        disabled={actionsDisabled}
        hitSlop={8}
        style={styles.textButton}
        onPress={onDelete}
      >
        <Text style={[styles.actionText, actionsDisabled && styles.disabledText]}>{t('deleteAction')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: 8,
      gap: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
      backgroundColor: c.background,
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
      paddingHorizontal: 8,
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
