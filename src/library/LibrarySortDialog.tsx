import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

export interface SortCriterionOption<C extends string> {
  value: C;
  label: string;
  /** 이 기준의 값을 계산하는 중이면 우측에 스피너를 보인다(앨범 "사진 개수"). */
  loading?: boolean;
  loadingTestID?: string;
}

interface LibrarySortDialogProps<C extends string> {
  visible: boolean;
  onClose: () => void;
  testIDPrefix: string;
  criteria: ReadonlyArray<SortCriterionOption<C>>;
  criterion: C;
  onCriterionChange: (criterion: C) => void;
  direction: 'asc' | 'desc';
  onDirectionChange: (direction: 'asc' | 'desc') => void;
  /** false면 방향 섹션을 숨긴다(앨범 목록의 "시스템 기본"은 방향이 없다). */
  showDirection?: boolean;
  /** 기준 목록 아래에 보이는 보충 설명(앨범 날짜별 보기의 묶음 기준 등). */
  footnote?: string;
}

/** 앨범 목록·갤러리가 공유하는 정렬 다이얼로그. 항목을 눌러도 닫히지 않는다(기준과 방향을 연달아 고르도록). */
export function LibrarySortDialog<C extends string>({
  visible,
  onClose,
  testIDPrefix: p,
  criteria,
  criterion,
  onCriterionChange,
  direction,
  onDirectionChange,
  showDirection = true,
  footnote,
}: LibrarySortDialogProps<C>) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('common');
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{t('sortDialog.title')}</Text>
          <Text style={styles.sectionLabel}>{t('sortDialog.criterion')}</Text>
          {criteria.map((option) => (
            <Pressable
              key={option.value}
              testID={`${p}-sort-criterion-${option.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected: criterion === option.value }}
              style={styles.optionRow}
              onPress={() => onCriterionChange(option.value)}
            >
              <Text style={styles.optionText}>{option.label}</Text>
              <View style={styles.trailing}>
                {option.loading ? <ActivityIndicator testID={option.loadingTestID} size="small" /> : null}
                {criterion === option.value ? <Text style={styles.check}>✓</Text> : null}
              </View>
            </Pressable>
          ))}
          {footnote ? (
            <Text testID={`${p}-sort-footnote`} style={styles.footnote}>
              {footnote}
            </Text>
          ) : null}
          {showDirection ? (
            <>
              <Text style={styles.sectionLabel}>{t('sortDialog.direction')}</Text>
              {(['asc', 'desc'] as const).map((value) => (
                <Pressable
                  key={value}
                  testID={`${p}-sort-direction-${value}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: direction === value }}
                  style={styles.optionRow}
                  onPress={() => onDirectionChange(value)}
                >
                  <Text style={styles.optionText}>
                    {value === 'asc' ? t('sortDirection.ascending') : t('sortDirection.descending')}
                  </Text>
                  {direction === value ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      width: '85%',
      maxWidth: 340,
      borderRadius: 12,
      backgroundColor: c.surface,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingHorizontal: 12,
    },
    optionText: {
      fontSize: 15,
      color: c.ink,
    },
    trailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    check: {
      color: c.accent,
      fontSize: 15,
      fontWeight: '700',
    },
    footnote: {
      fontSize: 12,
      lineHeight: 17,
      color: c.textSecondary,
      paddingHorizontal: 12,
      paddingTop: 4,
    },
  });
}
