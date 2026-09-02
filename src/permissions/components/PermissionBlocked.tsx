import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';

export interface PermissionBlockedProps {
  // 'blocked': 사진 권한 거부 + 재요청 불가(canAskAgain=false)
  // 'partial': Android 14+ 부분 접근 허용 상태 — 폴더 단위 선택과 맞지 않아 전체 허용 필요
  // 'audio_blocked': 기기 음악 선택용 오디오 권한 거부 + 재요청 불가
  variant: 'blocked' | 'partial' | 'audio_blocked';
  onOpenSettings: () => void;
}

export function PermissionBlocked({ variant, onOpenSettings }: PermissionBlockedProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('permissions');
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t(`blocked.${variant}.title`)}</Text>
      <Text style={styles.body}>{t(`blocked.${variant}.body`)}</Text>
      <Pressable style={styles.primaryButton} onPress={onOpenSettings}>
        <Text style={styles.primaryButtonText}>{t('blocked.openSettingsButton')}</Text>
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
  });
}
