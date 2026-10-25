import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getAppSetting } from '../db/client';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { folderPathToDirectory, isDirectMoveDestinationAllowed } from '../photos/directMove';
import { isDirectMoveSupported } from '../photos/fileMover';
import {
  childDirectories,
  collectKnownDirectories,
  DEFAULT_STORAGE_ROOT,
  directoryName,
  displayPath,
  isMediaStoreLocation,
  parentDirectory,
  storageRootOf,
} from './folderLocation';
import { MAX_FOLDER_NAME_LENGTH, validateNewFolderName } from './folderName';
import type { MoveMode } from './moveDecisions';
import { blockedTopDirectory, parseCachedAlbums, selectMoveTargets, type MoveTarget } from './moveTargets';

// AlbumListScreen이 저장하는 앨범 캐시 키(HiddenAlbumsScreen도 같은 값을 읽는다).
const ALBUM_THUMBNAIL_CACHE_KEY = 'album_thumbnail_cache';

type Step = 'pick' | 'create' | 'location';

interface MoveTargetModalProps {
  visible: boolean;
  /** 이동이면 "옮길 앨범", 복사면 "복사할 앨범"을 고르는 다이얼로그가 된다. */
  mode: MoveMode;
  /** 작업 대상 항목이 지금 들어 있는 앨범(들) — 후보에서 제외한다. */
  excludeDeviceAlbumIds: readonly string[];
  onSelect: (target: MoveTarget) => void;
  /** 새 폴더를 만든다 — 이미 검증·정리된 폴더 이름과 그 폴더를 만들 상위 폴더(절대 경로). */
  onCreateFolder: (folderName: string, parentDir: string) => void;
  onClose: () => void;
}

/** 선택한 사진·영상(또는 앨범)을 보낼 앨범을 고르거나, 새 폴더의 위치·이름을 입력받는 다이얼로그. */
export function MoveTargetModal({
  visible,
  mode,
  excludeDeviceAlbumIds,
  onSelect,
  onCreateFolder,
  onClose,
}: MoveTargetModalProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const [albums, setAlbums] = useState<MoveTarget[] | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [folderName, setFolderName] = useState('');
  const [parentDir, setParentDir] = useState(`${DEFAULT_STORAGE_ROOT}/Pictures`);
  const [browseDir, setBrowseDir] = useState(`${DEFAULT_STORAGE_ROOT}/Pictures`);
  const excludeKey = excludeDeviceAlbumIds.join('|');
  const directMoveSupported = useMemo(() => isDirectMoveSupported(), []);

  const knownDirs = useMemo(() => collectKnownDirectories((albums ?? []).map((a) => a.folderPath)), [albums]);
  const storageRoot = useMemo(
    () => knownDirs.map((dir) => storageRootOf(dir)).find((root) => root !== null) ?? DEFAULT_STORAGE_ROOT,
    [knownDirs]
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAlbums(null);
    setStep('pick');
    setFolderName('');
    getAppSetting(ALBUM_THUMBNAIL_CACHE_KEY)
      .then((cached) => {
        if (!cancelled) setAlbums(parseCachedAlbums(cached));
      })
      .catch((e) => {
        console.warn('[MoveTargetModal] failed to load album list', e);
        if (!cancelled) setAlbums([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // 앨범 목록이 (다시) 로드되면 새 폴더 기본 위치를 그 저장소의 Pictures로 되돌린다.
  useEffect(() => {
    setParentDir(`${storageRoot}/Pictures`);
    setBrowseDir(`${storageRoot}/Pictures`);
  }, [albums, storageRoot]);

  const targets = useMemo(
    () => (albums === null ? null : selectMoveTargets(albums, excludeKey ? excludeKey.split('|') : [])),
    [albums, excludeKey]
  );

  // 권한이 필요 없는 위치(Pictures 아래)만 만들 수 있는 빌드에서는 위치 선택도 그 안으로 한정한다.
  const locationAllowed = (dir: string) =>
    directMoveSupported ? isDirectMoveDestinationAllowed(dir) : isMediaStoreLocation(dir);

  // 이름 중복 검사: 고른 위치 바로 아래에 같은 이름의 폴더가 있는지. 경로를 모르는(구버전 캐시) 앨범은 제목으로 비교한다.
  const existingNames = useMemo(
    () =>
      (albums ?? []).flatMap((album) => {
        const dir = folderPathToDirectory(album.folderPath);
        if (!dir) return [album.title];
        return parentDirectory(dir) === parentDir ? [directoryName(dir)] : [];
      }),
    [albums, parentDir]
  );
  const validation = validateNewFolderName(folderName, existingNames);
  // 입력 중에 "비어 있어요" 같은 오류를 띄우진 않는다 — 버튼만 비활성화한다.
  const problem = !validation.ok && validation.problem !== 'empty' ? validation.problem : null;

  const browseChildren = childDirectories(knownDirs, browseDir).filter(locationAllowed);
  const browseParent = parentDirectory(browseDir);
  const canGoUp = browseParent !== null && locationAllowed(browseParent);

  const goBack = () => {
    if (step === 'location') setStep('create');
    else if (step === 'create') setStep('pick');
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={goBack}>
      <Pressable style={[styles.backdrop, step !== 'pick' && styles.backdropTop]} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {step === 'location' ? (
            <>
              <Text style={styles.title}>{t('locationTitle')}</Text>
              <Text testID="location-current" style={styles.pathText} numberOfLines={2}>
                {displayPath(browseDir)}
              </Text>
              <FlatList
                style={styles.list}
                data={browseChildren}
                keyExtractor={(dir) => dir}
                ListHeaderComponent={
                  canGoUp ? (
                    <Pressable
                      testID="location-up"
                      accessibilityRole="button"
                      style={styles.row}
                      onPress={() => setBrowseDir(browseParent as string)}
                    >
                      <Text style={styles.rowText}>{t('locationUp')}</Text>
                    </Pressable>
                  ) : null
                }
                ListEmptyComponent={<Text style={styles.empty}>{t('locationEmpty')}</Text>}
                renderItem={({ item: dir }) => (
                  <Pressable
                    testID={`location-dir-${dir}`}
                    accessibilityRole="button"
                    style={styles.row}
                    onPress={() => setBrowseDir(dir)}
                  >
                    <Text style={styles.rowText} numberOfLines={1}>
                      {directoryName(dir)}
                    </Text>
                  </Pressable>
                )}
              />
              <Pressable
                testID="location-choose"
                accessibilityRole="button"
                style={styles.row}
                onPress={() => {
                  setParentDir(browseDir);
                  setStep('create');
                }}
              >
                <Text style={styles.confirmText}>{t('locationChoose')}</Text>
              </Pressable>
              <Pressable testID="location-back" accessibilityRole="button" style={styles.cancel} onPress={() => setStep('create')}>
                <Text style={styles.cancelText}>{t('newFolderBack')}</Text>
              </Pressable>
            </>
          ) : step === 'create' ? (
            <>
              <Text style={styles.title}>{t('newFolderTitle')}</Text>
              <Pressable
                testID="new-folder-change-location"
                accessibilityRole="button"
                style={styles.locationRow}
                onPress={() => {
                  setBrowseDir(parentDir);
                  setStep('location');
                }}
              >
                <Text style={styles.hint}>{t('newFolderLocation')}</Text>
                <Text testID="new-folder-location" style={styles.locationText} numberOfLines={1}>
                  {displayPath(parentDir)}
                </Text>
                <Text style={styles.changeText}>{t('newFolderChangeLocation')}</Text>
              </Pressable>
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
                onSubmitEditing={() => validation.ok && onCreateFolder(validation.name, parentDir)}
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
                onPress={() => validation.ok && onCreateFolder(validation.name, parentDir)}
              >
                <Text style={styles.confirmText}>{t(mode === 'copy' ? 'newFolderConfirmCopy' : 'newFolderConfirm')}</Text>
              </Pressable>
              <Pressable
                testID="new-folder-back"
                accessibilityRole="button"
                style={styles.cancel}
                onPress={() => setStep('pick')}
              >
                <Text style={styles.cancelText}>{t('newFolderBack')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>{t(mode === 'copy' ? 'copyDialogTitle' : 'moveDialogTitle')}</Text>
              <Pressable
                testID="move-target-new-folder"
                accessibilityRole="button"
                style={styles.row}
                onPress={() => setStep('create')}
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
                  renderItem={({ item }) => {
                    const blockedDir = blockedTopDirectory(item.folderPath);
                    // 미디어 폴더 밖이어도 파일 직접 이동(모든 파일 접근)이 가능한 빌드·폴더면 고를 수 있다.
                    const directDir = folderPathToDirectory(item.folderPath);
                    const needsAllFiles =
                      blockedDir !== null &&
                      directMoveSupported &&
                      directDir !== null &&
                      isDirectMoveDestinationAllowed(directDir);
                    const disabled = blockedDir !== null && !needsAllFiles;
                    return (
                      <Pressable
                        testID={`move-target-${item.id}`}
                        accessibilityRole="button"
                        accessibilityState={{ disabled }}
                        disabled={disabled}
                        style={[styles.row, disabled && styles.disabled]}
                        onPress={() => onSelect(item)}
                      >
                        <Text style={styles.rowText} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {blockedDir !== null ? (
                          <Text testID={`move-target-blocked-${item.id}`} style={styles.blockedText} numberOfLines={1}>
                            {t(needsAllFiles ? 'moveTargetNeedsAllFiles' : 'moveTargetBlocked', { dir: blockedDir })}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  }}
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
    // 새 폴더 입력·위치 선택 단계: 키보드가 올라와도 카드가 가려지지 않게 위쪽에 붙인다(Modal은 별도
    // 윈도우라 화면 리사이즈가 반영되지 않을 수 있다).
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
    pathText: {
      fontSize: 13,
      color: c.ink,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    locationRow: {
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    locationText: {
      fontSize: 14,
      color: c.ink,
    },
    changeText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.accent,
      paddingTop: 2,
    },
    blockedText: {
      fontSize: 12,
      color: c.textSecondary,
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
      paddingVertical: 4,
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
