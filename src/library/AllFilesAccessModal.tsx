import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

interface AllFilesAccessModalProps {
  visible: boolean;
  folderTitle: string;
  onOpenSettings: () => void;
  onCancel: () => void;
}

/**
 * "모든 파일 접근" 권한을 설정에서 켜기 전에 보여주는 사전 고지(prominent disclosure).
 * 무엇을 위해(미디어 폴더 밖 폴더로 이동) 쓰고 무엇은 하지 않는지를 쉬운 말로 먼저 밝힌다 —
 * Play 정책이 요구하는 "사용자에게 명확히 알리고 동의받기"를 이 화면이 맡는다.
 */
export function AllFilesAccessModal({ visible, folderTitle, onOpenSettings, onCancel }: AllFilesAccessModalProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable testID="all-files-access-backdrop" style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{t('allFilesAccess.title')}</Text>
          <ScrollView style={styles.body}>
            <Text testID="all-files-access-why" style={styles.text}>
              {t('allFilesAccess.why', { folder: folderTitle })}
            </Text>
            <Text style={styles.heading}>{t('allFilesAccess.usesHeading')}</Text>
            <Text style={styles.text}>{t('allFilesAccess.uses')}</Text>
            <Text style={styles.heading}>{t('allFilesAccess.neverHeading')}</Text>
            <Text style={styles.text}>{t('allFilesAccess.never')}</Text>
            <Text style={styles.text}>{t('allFilesAccess.howToOff')}</Text>
          </ScrollView>
          <Pressable
            testID="all-files-access-open-settings"
            accessibilityRole="button"
            style={styles.primary}
            onPress={onOpenSettings}
          >
            <Text style={styles.primaryText}>{t('allFilesAccess.openSettings')}</Text>
          </Pressable>
          <Pressable testID="all-files-access-cancel" accessibilityRole="button" style={styles.cancel} onPress={onCancel}>
            <Text style={styles.cancelText}>{t('common:cancel')}</Text>
          </Pressable>
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
      width: '90%',
      maxWidth: 380,
      maxHeight: '80%',
      borderRadius: 12,
      backgroundColor: c.surface,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: c.ink,
      paddingBottom: 8,
    },
    body: {
      flexGrow: 0,
    },
    heading: {
      fontSize: 14,
      fontWeight: '600',
      color: c.ink,
      paddingTop: 12,
    },
    text: {
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      paddingTop: 4,
    },
    primary: {
      minHeight: 48,
      marginTop: 12,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    cancel: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 15,
      color: c.textSecondary,
    },
  });
}
