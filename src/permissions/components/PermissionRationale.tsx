import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';

export interface PermissionRationaleProps {
  // 'photo': 앨범 목록 화면 진입 시. 'audio': 앨범별 설정 화면에서 기기 음악 선택 시.
  variant?: 'photo' | 'audio';
  onConfirm: () => void;
  onCancel: () => void;
}

export function PermissionRationale({ variant = 'photo', onConfirm, onCancel }: PermissionRationaleProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('permissions');
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t(`rationale.${variant}.title`)}</Text>
      <Text style={styles.body}>{t(`rationale.${variant}.body`)}</Text>
      <Pressable style={styles.primaryButton} onPress={onConfirm}>
        <Text style={styles.primaryButtonText}>{t('rationale.continueButton')}</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onCancel}>
        <Text style={styles.secondaryButtonText}>{t('common:cancel')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
      color: c.ink,
    },
    body: {
      fontSize: 14,
      textAlign: 'center',
      color: c.textSecondary,
    },
    primaryButton: {
      backgroundColor: c.accent,
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 8,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    secondaryButton: {
      paddingVertical: 8,
    },
    secondaryButtonText: {
      color: c.textSecondary,
    },
  });
}
