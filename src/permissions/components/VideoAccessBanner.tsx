import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';

export interface VideoAccessBannerProps {
  onPress: () => void;
  onDismiss: () => void;
}

/**
 * 갤러리 상단의 비차단 1줄 배너. 영상 권한이 없으면 MediaStore가 영상 행을 돌려주지 않아 영상
 * 존재 여부를 알 수 없으므로, 앨범 내용과 무관하게 권한 상태만으로 노출한다.
 */
export function VideoAccessBanner({ onPress, onDismiss }: VideoAccessBannerProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <View testID="video-access-banner" style={styles.container}>
      <Pressable
        testID="video-access-banner-action"
        accessibilityRole="button"
        style={styles.main}
        onPress={onPress}
      >
        <Text style={styles.text}>{t('videoBanner.text')}</Text>
        <Text style={styles.action}>{t('videoBanner.action')}</Text>
      </Pressable>
      <Pressable
        testID="video-access-banner-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t('videoBanner.dismiss')}
        hitSlop={8}
        style={styles.dismiss}
        onPress={onDismiss}
      >
        <Text style={styles.dismissText}>✕</Text>
      </Pressable>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginTop: 8,
      borderRadius: 10,
      backgroundColor: c.accentSoft,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 10,
      paddingLeft: 12,
    },
    text: {
      flex: 1,
      fontSize: 13,
      color: c.ink,
    },
    action: {
      fontSize: 13,
      fontWeight: '700',
      color: c.accent,
    },
    dismiss: {
      minWidth: 40,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissText: {
      fontSize: 14,
      color: c.textSecondary,
    },
  });
}
