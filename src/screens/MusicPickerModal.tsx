import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';

import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import type { MusicSourceType } from '../db/types';
import { resolveDeviceTrackMetadata, type ResolvedTrackMetadata } from '../music/resolveTrackMetadata';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { buildFolderTree, getFolderPath, type FolderTreeNode } from '../settings/folderTree';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const AUDIO_GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['audio'];

type PickerMode = 'bundled' | 'flat' | 'folder';

interface DeviceAudioItem {
  id: string;
  title: string;
  uri: string;
  folderPath: string;
}

interface PickerRowItem {
  key: string;
  sourceType: MusicSourceType;
  sourceValue: string;
  uri?: string;
  title: string;
  artist: string | null;
  coverUri: string | null;
}

function musicKey(sourceType: MusicSourceType, sourceValue: string): string {
  return `${sourceType}:${sourceValue}`;
}

// 모듈 스코프 캐시라 모달을 닫았다 다시 열어도(같은 앱 세션 안에서는) 같은 파일을 다시
// 파싱하지 않는다. 컴포넌트 state(deviceMetadata)는 이 캐시를 렌더링에 반영하기 위한 것.
const deviceMetadataWarmCache = new Map<string, ResolvedTrackMetadata | null>();

function toDevicePickerRowItem(item: DeviceAudioItem, resolved: ResolvedTrackMetadata | null | undefined): PickerRowItem {
  return {
    key: musicKey('device', item.id),
    sourceType: 'device',
    sourceValue: item.id,
    uri: item.uri,
    title: resolved?.title ?? item.title,
    artist: resolved?.artist ?? null,
    coverUri: resolved?.coverUri ?? null,
  };
}

function filterByQuery(items: readonly PickerRowItem[], query: string): PickerRowItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items.slice();
  return items.filter(
    (item) => item.title.toLowerCase().includes(normalized) || (item.artist?.toLowerCase().includes(normalized) ?? false)
  );
}

export interface MusicPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectTracks: (
    tracks: readonly {
      sourceType: MusicSourceType;
      sourceValue: string;
      title: string;
      artist: string | null;
      coverUri: string | null;
    }[]
  ) => void;
  // 이미 재생목록에 있는 트랙(`${sourceType}:${sourceValue}`)은 세 탭 모두에서 목록에서 제외한다.
  alreadySelectedKeys: ReadonlySet<string>;
}

export function MusicPickerModal({ visible, onClose, onSelectTracks, alreadySelectedKeys }: MusicPickerModalProps) {
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } =
    useMediaLibraryPermission(AUDIO_GRANULAR_PERMISSIONS);
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [mode, setMode] = useState<PickerMode>('bundled');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<DeviceAudioItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [folderStack, setFolderStack] = useState<FolderTreeNode[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set());
  const [deviceMetadata, setDeviceMetadata] = useState<ReadonlyMap<string, ResolvedTrackMetadata | null>>(
    () => new Map(deviceMetadataWarmCache)
  );

  function handleMetadataResolved(assetId: string, result: ResolvedTrackMetadata | null) {
    setDeviceMetadata((prev) => {
      const next = new Map(prev);
      next.set(assetId, result);
      return next;
    });
  }

  const needsDeviceAccess = mode === 'flat' || mode === 'folder';

  useEffect(() => {
    if (visible && needsDeviceAccess && isReady && (state === 'idle' || state === 'denied')) start();
  }, [visible, needsDeviceAccess, isReady, state, start]);

  useEffect(() => {
    if (!visible) {
      setMode('bundled');
      setQuery('');
      setFolderStack([]);
      setSelectedKeys(new Set());
    }
  }, [visible]);

  useEffect(() => {
    setQuery('');
  }, [mode]);

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
            // getFilename()+getUri() 대신 getInfo() 하나로 합쳐 자산당 네이티브 브릿지
            // 호출을 2번에서 1번으로 줄인다(로딩이 느리다는 피드백에 대한 대응).
            const info = await asset.getInfo();
            return { id: asset.id, title: info.filename, uri: info.uri, folderPath: getFolderPath(info.uri) };
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

  const bundledItems: PickerRowItem[] = useMemo(
    () =>
      BUNDLED_MUSIC_TRACKS.filter((track) => !alreadySelectedKeys.has(musicKey('bundled', track.category))).map(
        (track) => ({
          key: musicKey('bundled', track.category),
          sourceType: 'bundled' as const,
          sourceValue: track.category,
          title: track.title,
          artist: track.artist,
          coverUri: null,
        })
      ),
    [alreadySelectedKeys]
  );
  const sortedBundledItems = useMemo(
    () => bundledItems.slice().sort((a, b) => a.title.localeCompare(b.title, 'ko')),
    [bundledItems]
  );
  const filteredBundledItems = useMemo(() => filterByQuery(sortedBundledItems, query), [sortedBundledItems, query]);

  const unselectedDeviceAudio = useMemo(
    () => (items ?? []).filter((item) => !alreadySelectedKeys.has(musicKey('device', item.id))),
    [items, alreadySelectedKeys]
  );
  const deviceFlatItems: PickerRowItem[] = useMemo(
    () => unselectedDeviceAudio.map((item) => toDevicePickerRowItem(item, deviceMetadata.get(item.id))),
    [unselectedDeviceAudio, deviceMetadata]
  );
  const sortedFlatItems = useMemo(
    () => deviceFlatItems.slice().sort((a, b) => a.title.localeCompare(b.title, 'ko')),
    [deviceFlatItems]
  );
  const filteredFlatItems = useMemo(() => filterByQuery(sortedFlatItems, query), [sortedFlatItems, query]);

  const itemsByKey = useMemo(() => {
    const map = new Map<string, PickerRowItem>();
    for (const item of bundledItems) map.set(item.key, item);
    for (const item of deviceFlatItems) map.set(item.key, item);
    return map;
  }, [bundledItems, deviceFlatItems]);

  const tree = useMemo(() => buildFolderTree(unselectedDeviceAudio), [unselectedDeviceAudio]);
  const deviceItemsById = useMemo(() => new Map(unselectedDeviceAudio.map((item) => [item.id, item])), [unselectedDeviceAudio]);
  const currentNode = folderStack[folderStack.length - 1] ?? null;
  const childFolders = currentNode ? currentNode.children : tree;
  const filesHere = (currentNode ? currentNode.itemIds : [])
    .map((id) => deviceItemsById.get(id))
    .filter((item): item is DeviceAudioItem => Boolean(item));
  // filesHere가 매 렌더마다 새로 계산되는 파생값이라 이 매핑을 useMemo로 감싸도 이득이
  // 없다(의존성이 항상 바뀜) — 그냥 일반 계산으로 둔다.
  const folderFileItems: PickerRowItem[] = filesHere.map((item) => toDevicePickerRowItem(item, deviceMetadata.get(item.id)));

  function openFolder(node: FolderTreeNode) {
    setFolderStack((prev) => [...prev, node]);
  }

  function goToBreadcrumb(index: number) {
    // index -1 = 루트
    setFolderStack((prev) => prev.slice(0, index + 1));
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    // selectedKeys(Set)는 삽입 순서를 보존하므로, 조회 순서가 아니라 사용자가
    // 체크한 순서 그대로 넘긴다 — 플레이리스트 순서의 기본값이 되는 값이라 중요하다.
    const selected = [...selectedKeys].map((key) => itemsByKey.get(key)).filter((item): item is PickerRowItem => Boolean(item));
    onSelectTracks(
      selected.map((item) => ({
        sourceType: item.sourceType,
        sourceValue: item.sourceValue,
        title: item.title,
        artist: item.artist,
        coverUri: item.coverUri,
      }))
    );
    onClose();
  }

  function renderRow(item: PickerRowItem) {
    return (
      <MusicRowView
        item={item}
        selected={selectedKeys.has(item.key)}
        onToggle={() => toggleSelected(item.key)}
        onMetadataResolved={handleMetadataResolved}
      />
    );
  }

  function renderSearchBar(placeholder: string) {
    return (
      <View style={styles.searchBar}>
        <TextInput
          testID="picker-search-input"
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={c.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <Pressable testID="picker-search-clear" onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.searchClear}>✕</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function cancelDeviceAccess() {
    // rationale을 취소해도 모달 전체를 닫지 않고 항상 이용 가능한 "기본음악" 탭으로
    // 돌아간다 — cancelRationale()만 부르면 상태가 idle이 돼 위 useEffect가 즉시 다시
    // start()를 걸어 rationale이 반복 노출되므로, 탭도 함께 되돌려 needsDeviceAccess를 끈다.
    cancelRationale();
    setMode('bundled');
  }

  function renderDeviceAccessGate() {
    if (state === 'rationale') {
      return <PermissionRationale variant="audio" onConfirm={confirmRationale} onCancel={cancelDeviceAccess} />;
    }
    if (state === 'blocked' || state === 'partial_unsupported') {
      return <PermissionBlocked variant="audio_blocked" onOpenSettings={openSettings} />;
    }
    if (state === 'granted' && loadError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>음악 목록을 불러오지 못했어요</Text>
        </View>
      );
    }
    if (state !== 'granted' || items === null) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      );
    }
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>음악 추가</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>

        <View style={styles.modeTabRow}>
          <Pressable
            testID="picker-mode-bundled"
            style={[styles.modeTab, mode === 'bundled' && styles.modeTabActive]}
            onPress={() => setMode('bundled')}
          >
            <Text style={[styles.modeTabText, mode === 'bundled' && styles.modeTabTextActive]}>기본음악</Text>
          </Pressable>
          {Platform.OS === 'android' && (
            <>
              <Pressable
                testID="picker-mode-flat"
                style={[styles.modeTab, mode === 'flat' && styles.modeTabActive]}
                onPress={() => setMode('flat')}
              >
                <Text style={[styles.modeTabText, mode === 'flat' && styles.modeTabTextActive]}>전체</Text>
              </Pressable>
              <Pressable
                testID="picker-mode-folder"
                style={[styles.modeTab, mode === 'folder' && styles.modeTabActive]}
                onPress={() => setMode('folder')}
              >
                <Text style={[styles.modeTabText, mode === 'folder' && styles.modeTabTextActive]}>폴더</Text>
              </Pressable>
            </>
          )}
        </View>

        {mode === 'bundled' && (
          <>
            {renderSearchBar('기본 음악 검색')}
            <FlatList
              data={filteredBundledItems}
              keyExtractor={(item) => item.key}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>{query.length > 0 ? '검색 결과가 없어요' : '추가할 수 있는 기본 음악이 없어요'}</Text>
                </View>
              }
              renderItem={({ item }) => renderRow(item)}
            />
          </>
        )}

        {mode === 'flat' && (
          <>
            {renderDeviceAccessGate() ?? (
              <>
                {renderSearchBar('음악 검색')}
                <FlatList
                  data={filteredFlatItems}
                  keyExtractor={(item) => item.key}
                  ListEmptyComponent={
                    <View style={styles.centered}>
                      <Text style={styles.emptyText}>
                        {query.length > 0 ? '검색 결과가 없어요' : '선택할 수 있는 음악 파일이 없어요'}
                      </Text>
                    </View>
                  }
                  renderItem={({ item }) => renderRow(item)}
                />
              </>
            )}
          </>
        )}

        {mode === 'folder' && (
          <>
            {renderDeviceAccessGate() ?? (
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
                    ...folderFileItems.map((item) => ({ kind: 'file' as const, item })),
                  ]}
                  keyExtractor={(row) => (row.kind === 'folder' ? `folder:${row.node.path}` : `file:${row.item.key}`)}
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
                      renderRow(row.item)
                    )
                  }
                />
              </>
            )}
          </>
        )}

        <Pressable
          testID="confirm-selection-button"
          style={[styles.confirmButton, selectedKeys.size === 0 && styles.confirmButtonDisabled]}
          disabled={selectedKeys.size === 0}
          onPress={handleConfirm}
        >
          <Text style={styles.confirmButtonText}>선택한 {selectedKeys.size}곡 추가</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function MusicRowView({
  item,
  selected,
  onToggle,
  onMetadataResolved,
}: {
  item: PickerRowItem;
  selected: boolean;
  onToggle: () => void;
  onMetadataResolved: (assetId: string, result: ResolvedTrackMetadata | null) => void;
}) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  // FlatList의 기본 windowing 덕에 이 컴포넌트는 대략 화면에 보이는(또는 곧 보일) 행만
  // 마운트된다 — 그래서 별도의 onViewableItemsChanged 없이도 "보이는 것만 태그를 읽는다"가
  // 자연히 성립한다. 번들 트랙은 sourceType이 'device'가 아니라 이 effect를 타지 않는다.
  useEffect(() => {
    if (item.sourceType !== 'device' || !item.uri) return;
    const assetId = item.sourceValue;
    const uri = item.uri;
    if (deviceMetadataWarmCache.has(assetId)) {
      onMetadataResolved(assetId, deviceMetadataWarmCache.get(assetId) ?? null);
      return;
    }
    let cancelled = false;
    resolveDeviceTrackMetadata(assetId, uri).then((result) => {
      deviceMetadataWarmCache.set(assetId, result);
      if (!cancelled) onMetadataResolved(assetId, result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.sourceType, item.sourceValue, item.uri]);

  return (
    <Pressable testID={`music-row-${item.key}`} style={styles.row} onPress={onToggle}>
      <Text style={styles.checkbox}>{selected ? '☑' : '☐'}</Text>
      {item.coverUri ? (
        <Image source={{ uri: item.coverUri }} style={styles.coverThumbnail} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Text style={styles.coverPlaceholderIcon}>♪</Text>
        </View>
      )}
      <View style={styles.rowTextGroup}>
        <Text style={styles.rowText} numberOfLines={1}>
          {item.title}
        </Text>
        {item.artist && (
          <Text style={styles.rowSubText} numberOfLines={1}>
            {item.artist}
          </Text>
        )}
      </View>
    </Pressable>
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
    modeTabRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    modeTab: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    modeTabActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    modeTabText: {
      fontSize: 14,
      color: c.ink,
    },
    modeTabTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: c.ink,
    },
    searchClear: {
      marginLeft: 8,
      color: c.textSecondary,
      fontSize: 15,
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
    coverThumbnail: {
      width: 36,
      height: 36,
      borderRadius: 6,
    },
    coverPlaceholder: {
      width: 36,
      height: 36,
      borderRadius: 6,
      backgroundColor: c.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverPlaceholderIcon: {
      fontSize: 16,
      color: c.textSecondary,
    },
    rowTextGroup: {
      flex: 1,
    },
    rowText: {
      fontSize: 16,
      color: c.ink,
    },
    rowSubText: {
      fontSize: 13,
      color: c.textSecondary,
      marginTop: 2,
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
