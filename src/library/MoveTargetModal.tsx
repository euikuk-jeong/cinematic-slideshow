import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getAppSetting } from '../db/client';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { parseMoveTargets, type MoveTarget } from './moveTargets';

// AlbumListScreen이 저장하는 앨범 캐시 키(HiddenAlbumsScreen도 같은 값을 읽는다).
const ALBUM_THUMBNAIL_CACHE_KEY = 'album_thumbnail_cache';

interface MoveTargetModalProps {
  visible: boolean;
  /** 이동할 항목이 지금 들어 있는 앨범 — 후보에서 제외한다. */
  currentDeviceAlbumId: string;
  onSelect: (target: MoveTarget) => void;
  onClose: () => void;
}

/** 선택한 사진·영상을 옮길 기존 앨범(폴더)을 고르는 다이얼로그. 새 폴더 만들기는 지원하지 않는다. */
export function MoveTargetModal({ visible, currentDeviceAlbumId, onSelect, onClose }: MoveTargetModalProps) {
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const [targets, setTargets] = useState<MoveTarget[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setTargets(null);
    getAppSetting(ALBUM_THUMBNAIL_CACHE_KEY)
      .then((cached) => {
        if (!cancelled) setTargets(parseMoveTargets(cached, currentDeviceAlbumId));
      })
      .catch((e) => {
        console.warn('[MoveTargetModal] failed to load album list', e);
        if (!cancelled) setTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, currentDeviceAlbumId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{t('moveDialogTitle')}</Text>
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
