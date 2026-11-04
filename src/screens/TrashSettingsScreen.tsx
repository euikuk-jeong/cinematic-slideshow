import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppBannerAd } from '../ads/AppBannerAd';
import { getAppSetting, setAppSetting } from '../db/client';
import {
  parseTrashRetentionDays,
  TRASH_RETENTION_DAYS_STORAGE_KEY,
  TRASH_RETENTION_OPTIONS_DAYS,
} from '../settings/trashPreference';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

/**
 * 휴지통 설정: 보관 기간. 값이 바뀌는 즉시 저장하고(저장 버튼 없음), 이후 새로 삭제하는 항목부터 적용된다.
 * 휴지통 사용 여부는 앱 설정 화면에 있다.
 */
export function TrashSettingsScreen() {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('appSettings');
  const styles = useMemo(() => createStyles(c), [c]);
  // null = 아직 로드 전.
  const [days, setDays] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(TRASH_RETENTION_DAYS_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setDays(parseTrashRetentionDays(raw));
      })
      .catch((e) => {
        console.warn('[TrashSettings] failed to load retention setting', e);
        if (!cancelled) setDays(parseTrashRetentionDays(null));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelect(next: number) {
    setDays(next);
    setAppSetting(TRASH_RETENTION_DAYS_STORAGE_KEY, String(next)).catch((e) =>
      console.warn('[TrashSettings] failed to save retention setting', e)
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>{t('trashRetentionTitle')}</Text>
        <View style={styles.optionRow}>
          {TRASH_RETENTION_OPTIONS_DAYS.map((option) => {
            const active = days === option;
            return (
              <Pressable
                key={option}
                testID={`trash-retention-${option}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: days === null }}
                disabled={days === null}
                style={[styles.optionButton, active && styles.optionButtonActive]}
                onPress={() => handleSelect(option)}
              >
                <Text style={[styles.optionText, active && styles.optionTextActive]}>
                  {t('trashRetentionOption', { count: option })}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t('trashRetentionHint')}</Text>
      </View>
      <AppBannerAd />
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    optionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    optionButton: {
      minWidth: 72,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
      alignItems: 'center',
    },
    optionButtonActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    optionText: {
      fontSize: 14,
      color: c.ink,
    },
    optionTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
    hint: {
      fontSize: 12,
      color: c.textSecondary,
      lineHeight: 18,
    },
  });
}
