import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { MAX_FOLDER_NAME_LENGTH, validateNewFolderName } from './folderName';

interface RenameAlbumModalProps {
  visible: boolean;
  currentName: string;
  /** 같은 위치(상위 폴더)에 이미 있는 폴더 이름들 — 같은 이름으로는 바꿀 수 없다. */
  siblingNames: readonly string[];
  onConfirm: (newName: string) => void;
  onClose: () => void;
}

/**
 * 앨범(폴더) 이름 바꾸기. MediaStore에는 폴더 rename이 없어 "같은 상위 폴더의 새 이름 폴더로 전부 이동"으로
 * 처리되므로, 이름 규칙은 새 폴더 만들기와 같다(검증은 folderName.ts 한 곳).
 */
export function RenameAlbumModal({ visible, currentName, siblingNames, onConfirm, onClose }: RenameAlbumModalProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    if (visible) setValue(currentName);
  }, [visible, currentName]);

  const validation = validateNewFolderName(value, siblingNames);
  const problem = !validation.ok && validation.problem !== 'empty' ? validation.problem : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{t('renameDialogTitle')}</Text>
          <TextInput
            testID="rename-input"
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={t('renamePlaceholder')}
            placeholderTextColor={c.textSecondary}
            maxLength={MAX_FOLDER_NAME_LENGTH * 2}
            autoFocus
            selectTextOnFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => validation.ok && onConfirm(validation.name)}
          />
          {problem ? (
            <Text testID="rename-error" style={styles.error}>
              {t(`renameProblem.${problem}`, { max: MAX_FOLDER_NAME_LENGTH })}
            </Text>
          ) : (
            <Text style={styles.hint}>{t('newFolderHint')}</Text>
          )}
          <Pressable
            testID="rename-confirm"
            accessibilityRole="button"
            accessibilityState={{ disabled: !validation.ok }}
            disabled={!validation.ok}
            style={[styles.row, !validation.ok && styles.disabled]}
            onPress={() => validation.ok && onConfirm(validation.name)}
          >
            <Text style={styles.confirmText}>{t('renameConfirm')}</Text>
          </Pressable>
          <Pressable testID="rename-cancel" accessibilityRole="button" style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('common:cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    // 키보드가 올라와도 카드가 가려지지 않게 위쪽에 붙인다.
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'flex-start',
      padding: 16,
      paddingTop: 72,
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
    input: {
      minHeight: 44,
      marginHorizontal: 12,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      fontSize: 15,
      color: c.ink,
    },
    hint: {
      fontSize: 12,
      color: c.textSecondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    error: {
      fontSize: 12,
      color: '#D64545',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    row: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    confirmText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.accent,
    },
    disabled: {
      opacity: 0.4,
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
