import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getAppSetting } from '../db/client';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { MAX_FOLDER_NAME_LENGTH, validateNewFolderName } from './folderName';
import { parseCachedAlbums, selectMoveTargets, type MoveTarget } from './moveTargets';

// AlbumListScreen이 저장하는 앨범 캐시 키(HiddenAlbumsScreen도 같은 값을 읽는다).
const ALBUM_THUMBNAIL_CACHE_KEY = 'album_thumbnail_cache';

interface MoveTargetModalProps {
  visible: boolean;
  /** 이동할 항목이 지금 들어 있는 앨범 — 후보에서 제외한다. */
  currentDeviceAlbumId: string;
  onSelect: (target: MoveTarget) => void;
  /** 새 폴더를 만들어 옮긴다 — 이미 검증·정리된 폴더 이름. */
  onCreateFolder: (folderName: string) => void;
  onClose: () => void;
}

/** 선택한 사진·영상을 옮길 앨범(폴더)을 고르거나, 새 폴더 이름을 입력받는 다이얼로그. */
export function MoveTargetModal({
  visible,
  currentDeviceAlbumId,
  onSelect,
  onCreateFolder,
  onClose,
}: MoveTargetModalProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const [targets, setTargets] = useState<MoveTarget[] | null>(null);
  // 새 폴더 이름 중복 검사용 — 현재 앨범도 포함해야 같은 이름으로 "새로" 만드는 것을 막을 수 있다.
  const [existingTitles, setExistingTitles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setTargets(null);
    setExistingTitles([]);
    setCreating(false);
    setFolderName('');
    getAppSetting(ALBUM_THUMBNAIL_CACHE_KEY)
      .then((cached) => {
        if (cancelled) return;
        const albums = parseCachedAlbums(cached);
        setTargets(selectMoveTargets(albums, currentDeviceAlbumId));
        setExistingTitles(albums.map((album) => album.title));
      })
      .catch((e) => {
        console.warn('[MoveTargetModal] failed to load album list', e);
        if (!cancelled) setTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, currentDeviceAlbumId]);

  const validation = validateNewFolderName(folderName, existingTitles);
  // 입력 중에 "비어 있어요" 같은 오류를 띄우진 않는다 — 버튼만 비활성화한다.
  const problem = !validation.ok && validation.problem !== 'empty' ? validation.problem : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={creating ? () => setCreating(false) : onClose}>
      <Pressable style={[styles.backdrop, creating && styles.backdropTop]} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {creating ? (
            <>
              <Text style={styles.title}>{t('newFolderTitle')}</Text>
              <TextInput
                testID="new-folder-input"
                style={styles.input}
                value={folderName}
                onChangeText={setFolderName}
                placeholder={t('newFolderPlaceholder')}
                placeholderTextColor={c.textSecondary}
                maxLength={MAX_FOLDER_NAME_LENGTH * 2}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={() => validation.ok && onCreateFolder(validation.name)}
              />
              {problem ? (
                <Text testID="new-folder-error" style={styles.error}>
                  {t(`newFolderProblem.${problem}`, { max: MAX_FOLDER_NAME_LENGTH })}
                </Text>
              ) : (
                <Text style={styles.hint}>{t('newFolderHint')}</Text>
              )}
              <Pressable
                testID="new-folder-confirm"
                accessibilityRole="button"
                accessibilityState={{ disabled: !validation.ok }}
                disabled={!validation.ok}
                style={[styles.row, !validation.ok && styles.disabled]}
                onPress={() => validation.ok && onCreateFolder(validation.name)}
              >
                <Text style={styles.confirmText}>{t('newFolderConfirm')}</Text>
              </Pressable>
              <Pressable
                testID="new-folder-back"
                accessibilityRole="button"
                style={styles.cancel}
                onPress={() => setCreating(false)}
              >
                <Text style={styles.cancelText}>{t('newFolderBack')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t('moveDialogTitle')}</Text>
              <Pressable
                testID="move-target-new-folder"
                accessibilityRole="button"
                style={styles.row}
                onPress={() => setCreating(true)}
              >
                <Text style={styles.newFolderText}>{t('newFolderAction')}</Text>
              </Pressable>
              {targets === null ? (
                <ActivityIndicator testID="move-target-loading" style={styles.loading} />
              ) : targets.length === 0 ? (
                <Text testID="move-target-empty" style={styles.empty}>
                  {t('moveDialogEmpty')}
                </Text>
              ) : (
                <FlatList
                  style={styles.list}
                  data={targets}
                  keyExtractor={(target) => target.id}
                  renderItem={({ item }) => (
                    <Pressable
                      testID={`move-target-${item.id}`}
                      accessibilityRole="button"
                      style={styles.row}
                      onPress={() => onSelect(item)}
                    >
                      <Text style={styles.rowText} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </Pressable>
                  )}
                />
              )}
              <Pressable testID="move-target-cancel" accessibilityRole="button" style={styles.cancel} onPress={onClose}>
                <Text style={styles.cancelText}>{t('common:cancel')}</Text>
              </Pressable>
            </>
          )}
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
    // 새 폴더 입력 단계: 키보드가 올라와도 카드가 가려지지 않게 위쪽에 붙인다(Modal은 별도 윈도우라
    // 화면 리사이즈가 반영되지 않을 수 있다).
    backdropTop: {
      justifyContent: 'flex-start',
      paddingTop: 72,
    },
    card: {
      width: '85%',
      maxWidth: 340,
      maxHeight: '70%',
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
    loading: {
      paddingVertical: 24,
    },
    empty: {
      fontSize: 14,
      color: c.textSecondary,
      paddingHorizontal: 12,
      paddingVertical: 16,
    },
    list: {
      flexGrow: 0,
    },
    row: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    rowText: {
      fontSize: 15,
      color: c.ink,
    },
    newFolderText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.accent,
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
