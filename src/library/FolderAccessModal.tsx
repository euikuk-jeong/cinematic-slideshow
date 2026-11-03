import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

interface FolderAccessModalProps {
  visible: boolean;
  folderTitle: string;
  /** 폴더 선택기에서 골라 달라고 할 폴더(화면 표시용 경로). */
  grantFolder: string;
  onContinue: () => void;
  onCancel: () => void;
}

/**
 * 미디어 폴더 밖으로 옮기기·복사 전에 시스템 폴더 선택기(SAF)를 여는 이유와 어느 폴더를 고르면 되는지 먼저 알린다.
 * 선택기는 처음 쓰는 사람에게 낯설고 아무 폴더나 고를 수 있어서, 고를 폴더와 "이 폴더 사용" 버튼을 미리 안내한다.
 */
export function FolderAccessModal({ visible, folderTitle, grantFolder, onContinue, onCancel }: FolderAccessModalProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable testID="folder-access-backdrop" style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{t('folderAccess.title')}</Text>
          <ScrollView style={styles.body}>
            <Text testID="folder-access-why" style={styles.text}>
              {t('folderAccess.why', { folder: folderTitle })}
            </Text>
            <Text style={styles.heading}>{t('folderAccess.howHeading')}</Text>
            <Text testID="folder-access-how" style={styles.text}>
              {t('folderAccess.how', { grant: grantFolder })}
            </Text>
            <Text style={styles.heading}>{t('folderAccess.moveHeading')}</Text>
            <Text style={styles.text}>{t('folderAccess.move')}</Text>
            <Text style={styles.text}>{t('folderAccess.never')}</Text>
          </ScrollView>
          <Pressable
            testID="folder-access-continue"
            accessibilityRole="button"
            style={styles.primary}
            onPress={onContinue}
          >
            <Text style={styles.primaryText}>{t('folderAccess.continue')}</Text>
          </Pressable>
          <Pressable testID="folder-access-cancel" accessibilityRole="button" style={styles.cancel} onPress={onCancel}>
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
