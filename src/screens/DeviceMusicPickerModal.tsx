import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';

import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { buildFolderTree, getFolderPath, type FolderTreeNode } from '../settings/folderTree';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const AUDIO_GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['audio'];

interface DeviceAudioItem {
  id: string;
  title: string;
  folderPath: string;
}

export interface DeviceMusicPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectTracks: (tracks: readonly { sourceValue: string; title: string }[]) => void;
}

export function DeviceMusicPickerModal({ visible, onClose, onSelectTracks }: DeviceMusicPickerModalProps) {
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } =
    useMediaLibraryPermission(AUDIO_GRANULAR_PERMISSIONS);
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [items, setItems] = useState<DeviceAudioItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [folderStack, setFolderStack] = useState<FolderTreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (visible && isReady && (state === 'idle' || state === 'denied')) start();
  }, [visible, isReady, state, start]);

  useEffect(() => {
    if (!visible) {
      setFolderStack([]);
      setSelectedIds(new Set());
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || state !== 'granted') return;
    let cancelled = false;
    setLoadError(false);
    new MediaLibrary.Query()
      .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.AUDIO)
      .exe()
      .then((assets) =>
        Promise.all(
          assets.map(async (asset) => {
            const [title, uri] = await Promise.all([asset.getFilename(), asset.getUri()]);
            return { id: asset.id, title, folderPath: uri === null ? '' : getFolderPath(uri) };
          })
        )
      )
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, state]);

  const tree = useMemo(() => (items ? buildFolderTree(items) : []), [items]);
  const itemsById = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);
  const currentNode = folderStack[folderStack.length - 1] ?? null;
  const childFolders = currentNode ? currentNode.children : tree;
  const filesHere = (currentNode ? currentNode.itemIds : []).map((id) => itemsById.get(id)!).filter(Boolean);

  function openFolder(node: FolderTreeNode) {
    setFolderStack((prev) => [...prev, node]);
  }

  function goToBreadcrumb(index: number) {
    // index -1 = 루트
    setFolderStack((prev) => prev.slice(0, index + 1));
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    // selectedIds(Set)는 삽입 순서를 보존하므로, 기기 조회 순서가 아니라 사용자가
    // 체크한 순서 그대로 넘긴다 — 플레이리스트 순서의 기본값이 되는 값이라 중요하다.
    const selected = [...selectedIds].map((id) => itemsById.get(id)!).filter(Boolean);
    onSelectTracks(selected.map((item) => ({ sourceValue: item.id, title: item.title })));
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>기기 음악에서 선택</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>
        {state === 'rationale' && (
          <PermissionRationale variant="audio" onConfirm={confirmRationale} onCancel={onClose} />
        )}
        {(state === 'blocked' || state === 'partial_unsupported') && (
          <PermissionBlocked variant="audio_blocked" onOpenSettings={openSettings} />
        )}
        {state === 'granted' && loadError && (
          <View style={styles.centered}>
            <Text style={styles.errorText}>음악 목록을 불러오지 못했어요</Text>
          </View>
        )}
        {state === 'granted' && !loadError && items === null && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}
        {state === 'granted' && !loadError && items !== null && (
          <>
            <View style={styles.breadcrumbRow}>
              <Pressable testID="breadcrumb-root" onPress={() => goToBreadcrumb(-1)}>
                <Text style={styles.breadcrumbText}>루트</Text>
              </Pressable>
              {folderStack.map((node, index) => (
                <View key={node.path} style={styles.breadcrumbSegment}>
                  <Text style={styles.breadcrumbSeparator}>/</Text>
                  <Pressable testID={`breadcrumb-${index}`} onPress={() => goToBreadcrumb(index)}>
                    <Text style={styles.breadcrumbText} numberOfLines={1}>
                      {node.label}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <FlatList
              data={[
                ...childFolders.map((node) => ({ kind: 'folder' as const, node })),
                ...filesHere.map((item) => ({ kind: 'file' as const, item })),
              ]}
              keyExtractor={(row) => (row.kind === 'folder' ? `folder:${row.node.path}` : `file:${row.item.id}`)}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>선택할 수 있는 음악 파일이 없어요</Text>
                </View>
              }
              renderItem={({ item: row }) =>
                row.kind === 'folder' ? (
                  <Pressable
                    testID={`folder-row-${row.node.path}`}
                    style={styles.row}
                    onPress={() => openFolder(row.node)}
                  >
                    <Text style={styles.folderIcon}>📁</Text>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {row.node.label}
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    testID={`file-row-${row.item.id}`}
                    style={styles.row}
                    onPress={() => toggleSelected(row.item.id)}
                  >
                    <Text style={styles.checkbox}>{selectedIds.has(row.item.id) ? '☑' : '☐'}</Text>
                    <Text style={styles.rowText} numberOfLines={1}>
                      {row.item.title}
                    </Text>
                  </Pressable>
                )
              }
            />
            <Pressable
              testID="confirm-selection-button"
              style={[styles.confirmButton, selectedIds.size === 0 && styles.confirmButtonDisabled]}
              disabled={selectedIds.size === 0}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmButtonText}>선택한 {selectedIds.size}곡 추가</Text>
            </Pressable>
          </>
        )}
        {(state === 'idle' || state === 'requesting') && (
          <View style={styles.centered}>
            <ActivityIndicator />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.ink,
    },
    closeText: {
      color: c.textSecondary,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyText: {
      color: c.textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
    },
    breadcrumbRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    breadcrumbSegment: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    breadcrumbSeparator: {
      color: c.textSecondary,
      marginHorizontal: 4,
    },
    breadcrumbText: {
      fontSize: 13,
      color: c.accent,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    folderIcon: {
      fontSize: 16,
    },
    checkbox: {
      fontSize: 18,
      color: c.accent,
    },
    rowText: {
      flex: 1,
      fontSize: 16,
      color: c.ink,
    },
    confirmButton: {
      margin: 20,
      paddingVertical: 14,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: 'center',
    },
    confirmButtonDisabled: {
      backgroundColor: c.hairline,
    },
    confirmButtonText: {
      color: c.background,
      fontWeight: '600',
      fontSize: 16,
    },
  });
}
